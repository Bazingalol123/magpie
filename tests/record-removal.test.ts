import { removeRecord } from "../base44/shared/record-removal.ts";
import { HttpError } from "../base44/shared/http.ts";

function fakeService(seed: Record<string, any[]> = {}) {
  const tables: Record<string, any[]> = {};
  for (const name of ["Clip", "Collection", "Record", "RoutingDecision", "WatchRule", "Enrichment"]) {
    tables[name] = (seed[name] ?? []).map((row) => ({ ...row }));
  }
  const service = Object.fromEntries(Object.keys(tables).map((name) => [
    name,
    {
      get: async (id: string) => tables[name].find((row) => row.id === id) ?? null,
      filter: async (query: Record<string, unknown>, _sort?: string, limit?: number, skip = 0) =>
        tables[name]
          .filter((row) => Object.entries(query).every(([key, value]) => row[key] === value))
          .slice(skip, skip + (limit ?? tables[name].length)),
      delete: async (id: string) => {
        const index = tables[name].findIndex((row) => row.id === id);
        if (index < 0) throw new Error(`Entity ${name} with ID ${id} not found`);
        tables[name].splice(index, 1);
      },
    },
  ]));
  return { service, tables };
}

function seedItem(overrides: Record<string, any[]> = {}) {
  return {
    Record: [{
      id: "record-1",
      owner_id: "owner-1",
      collection_id: "collection-1",
      clip_id: "clip-1",
      fields_json: "{}",
      source_url: "https://shop.example/item",
    }],
    Clip: [{ id: "clip-1", owner_id: "owner-1", source_url: "https://shop.example/item" }],
    RoutingDecision: [{ id: "decision-1", owner_id: "owner-1", clip_id: "clip-1", outcome: "existing" }],
    WatchRule: [
      { id: "watch-1", owner_id: "owner-1", record_id: "record-1", active: true },
      { id: "watch-2", owner_id: "owner-1", record_id: "record-1", active: false },
    ],
    Enrichment: [
      { id: "enrichment-1", owner_id: "owner-1", record_id: "record-1", field: "price" },
      { id: "enrichment-2", owner_id: "owner-1", record_id: "record-1", field: "price" },
      { id: "enrichment-3", owner_id: "owner-1", record_id: "record-1", field: "availability" },
    ],
    ...overrides,
  };
}

function assert(condition: unknown, message = "Assertion failed"): asserts condition {
  if (!condition) throw new Error(message);
}

function assertEquals(actual: unknown, expected: unknown, message = "Values differ") {
  const left = JSON.stringify(actual);
  const right = JSON.stringify(expected);
  if (left !== right) throw new Error(`${message}\nexpected: ${right}\nactual:   ${left}`);
}

async function assertThrowsHttp(callback: () => Promise<unknown>, status: number, message = `expected HttpError ${status}`) {
  try {
    await callback();
  } catch (error) {
    if (error instanceof HttpError) {
      assertEquals(error.status, status, message);
      return error;
    }
    throw error;
  }
  throw new Error(`${message}: no error was thrown`);
}

Deno.test("removal cascades over watches, history, decision, capture, and the Item", async () => {
  const { service, tables } = fakeService(seedItem());

  const result = await removeRecord(service, "owner-1", "record-1");

  assertEquals(result.deleted, {
    watch_rules: 2,
    enrichments: 3,
    decisions: 1,
    clips: 1,
    records: 1,
  }, "expected full cascade counts");
  for (const name of ["Record", "Clip", "RoutingDecision", "WatchRule", "Enrichment"]) {
    assertEquals(tables[name].length, 0, `expected ${name} to be empty`);
  }
});

Deno.test("removal pages past a single fetch page so no Enrichment or WatchRule is orphaned", async () => {
  const manyEnrichments = Array.from({ length: 250 }, (_, index) => ({
    id: `enrichment-${index}`,
    owner_id: "owner-1",
    record_id: "record-1",
    field: "price",
  }));
  const manyWatchRules = Array.from({ length: 150 }, (_, index) => ({
    id: `watch-${index}`,
    owner_id: "owner-1",
    record_id: "record-1",
    active: true,
  }));
  const { service, tables } = fakeService(seedItem({
    Enrichment: manyEnrichments,
    WatchRule: manyWatchRules,
  }));

  const result = await removeRecord(service, "owner-1", "record-1");

  assertEquals(result.deleted.enrichments, 250, "every Enrichment row must be deleted, not just the first page");
  assertEquals(result.deleted.watch_rules, 150, "every WatchRule row must be deleted, not just the first page");
  assertEquals(tables.Enrichment.length, 0, "no Enrichment row may survive a completed cascade");
  assertEquals(tables.WatchRule.length, 0, "no WatchRule row may survive a completed cascade");
});

Deno.test("removal never touches another owner's Item", async () => {
  const { service, tables } = fakeService(seedItem({
    Record: [{ id: "record-1", owner_id: "owner-2", collection_id: "collection-1", clip_id: "clip-1", fields_json: "{}", source_url: "https://x.example" }],
  }));

  await assertThrowsHttp(() => removeRecord(service, "owner-1", "record-1"), 403);
  assertEquals(tables.WatchRule.length, 2, "no child rows may be deleted on a rejected call");
  assertEquals(tables.Clip.length, 1, "the capture must survive a rejected call");
});

Deno.test("a cross-owner Clip aborts the cascade before any delete", async () => {
  const { service, tables } = fakeService(seedItem({
    Clip: [{ id: "clip-1", owner_id: "owner-2", source_url: "https://x.example" }],
  }));

  await assertThrowsHttp(() => removeRecord(service, "owner-1", "record-1"), 403);
  assertEquals(tables.WatchRule.length, 2, "validation must happen before the first delete");
  assertEquals(tables.Record.length, 1, "the Record must survive an aborted cascade");
});

Deno.test("removing a missing Item returns 404 so a retry reads as done", async () => {
  const { service } = fakeService();
  await assertThrowsHttp(() => removeRecord(service, "owner-1", "record-9"), 404);
});

Deno.test("a partial-state retry skips already-missing children and finishes", async () => {
  const { service, tables } = fakeService(seedItem({
    WatchRule: [],
    Enrichment: [],
    RoutingDecision: [],
    Clip: [],
  }));

  const result = await removeRecord(service, "owner-1", "record-1");

  assertEquals(result.deleted, {
    watch_rules: 0,
    enrichments: 0,
    decisions: 0,
    clips: 0,
    records: 1,
  }, "missing children are skipped, not errors");
  assertEquals(tables.Record.length, 0, "the Record itself is still removed");
});

Deno.test("a hosted not-found throw from Record.get maps to 404", async () => {
  const { service } = fakeService();
  service.Record.get = async (id: string) => {
    throw new Error(`Entity Record with ID ${id} not found`);
  };
  await assertThrowsHttp(() => removeRecord(service, "owner-1", "record-1"), 404);
});

Deno.test("a row vanishing mid-cascade is skipped instead of failing the removal", async () => {
  const { service, tables } = fakeService(seedItem());
  const originalDelete = service.WatchRule.delete;
  let simulatedRace = false;
  service.WatchRule.delete = async (id: string) => {
    if (!simulatedRace) {
      simulatedRace = true;
      const index = tables.WatchRule.findIndex((row) => row.id === id);
      tables.WatchRule.splice(index, 1);
    }
    return originalDelete(id);
  };

  const result = await removeRecord(service, "owner-1", "record-1");

  assert(result.deleted.watch_rules >= 1, "the surviving watch is still deleted");
  assertEquals(tables.Record.length, 0, "the removal still completes");
});
