import { removeMission } from "../base44/shared/mission-removal.ts";
import { HttpError } from "../base44/shared/http.ts";

function fakeService(seed: Record<string, any[]> = {}) {
  const tables: Record<string, any[]> = {};
  for (const name of ["Clip", "Collection", "Mission", "Record", "RoutingDecision", "WatchRule", "Enrichment"]) {
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

function record(overrides: Record<string, any>) {
  return {
    owner_id: "owner-1",
    fields_json: "{}",
    source_url: "https://shop.example/item",
    ...overrides,
  };
}

function seedMission(overrides: Record<string, any[]> = {}) {
  return {
    Mission: [{ id: "mission-1", owner_id: "owner-1", title: "Move to Berlin", constraints_json: "{}", status: "active" }],
    Collection: [
      { id: "collection-1", owner_id: "owner-1", mission_id: "mission-1", name: "Apartments", schema_json: "{}" },
      { id: "collection-2", owner_id: "owner-1", mission_id: "mission-1", name: "Movers", schema_json: "{}" },
    ],
    Record: [
      record({ id: "record-1", collection_id: "collection-1", clip_id: "clip-1" }),
      record({ id: "record-2", collection_id: "collection-2", clip_id: "clip-2" }),
    ],
    Clip: [
      { id: "clip-1", owner_id: "owner-1", source_url: "https://shop.example/1" },
      { id: "clip-2", owner_id: "owner-1", source_url: "https://shop.example/2" },
    ],
    RoutingDecision: [
      { id: "decision-1", owner_id: "owner-1", clip_id: "clip-1", outcome: "existing" },
      { id: "decision-2", owner_id: "owner-1", clip_id: "clip-2", outcome: "existing" },
    ],
    WatchRule: [
      { id: "watch-1", owner_id: "owner-1", record_id: "record-1", active: true },
    ],
    Enrichment: [
      { id: "enrichment-1", owner_id: "owner-1", record_id: "record-1", field: "price" },
    ],
    ...overrides,
  };
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

Deno.test("removal cascades over every scoped Collection's Records, then the Collections, then the Mission", async () => {
  const { service, tables } = fakeService(seedMission());

  const result = await removeMission(service, "owner-1", "mission-1");

  assertEquals(result.deleted, {
    watch_rules: 1,
    enrichments: 1,
    decisions: 2,
    clips: 2,
    records: 2,
    collections: 2,
    missions: 1,
  }, "expected full cascade counts across both Collections");
  for (const name of ["Mission", "Collection", "Record", "Clip", "RoutingDecision", "WatchRule", "Enrichment"]) {
    assertEquals(tables[name].length, 0, `expected ${name} to be empty`);
  }
});

Deno.test("removal never touches another owner's Project", async () => {
  const { service, tables } = fakeService(seedMission({
    Mission: [{ id: "mission-1", owner_id: "owner-2", title: "Move to Berlin", constraints_json: "{}", status: "active" }],
  }));

  await assertThrowsHttp(() => removeMission(service, "owner-1", "mission-1"), 403);
  assertEquals(tables.Collection.length, 2, "no child rows may be deleted on a rejected call");
});

Deno.test("removing a missing Project returns 404 so a retry reads as done", async () => {
  const { service } = fakeService();
  await assertThrowsHttp(() => removeMission(service, "owner-1", "mission-9"), 404);
});

Deno.test("a partial-state retry skips already-missing children and finishes", async () => {
  const { service, tables } = fakeService(seedMission({
    WatchRule: [],
    Enrichment: [],
    RoutingDecision: [],
    Clip: [],
  }));

  const result = await removeMission(service, "owner-1", "mission-1");

  assertEquals(result.deleted, {
    watch_rules: 0,
    enrichments: 0,
    decisions: 0,
    clips: 0,
    records: 2,
    collections: 2,
    missions: 1,
  }, "missing children are skipped, not errors");
  assertEquals(tables.Mission.length, 0, "the Mission itself is still removed");
});

Deno.test("a global Collection outside the Mission survives untouched", async () => {
  const { service, tables } = fakeService(seedMission({
    Collection: [
      { id: "collection-1", owner_id: "owner-1", mission_id: "mission-1", name: "Apartments", schema_json: "{}" },
      { id: "collection-2", owner_id: "owner-1", mission_id: "mission-1", name: "Movers", schema_json: "{}" },
      { id: "collection-global", owner_id: "owner-1", name: "Recipes", schema_json: "{}" },
    ],
  }));

  await removeMission(service, "owner-1", "mission-1");

  assertEquals(tables.Collection.map((row) => row.id), ["collection-global"], "the unscoped global Collection must survive");
});

Deno.test("a needs_review Clip hinted at the Mission survives untouched", async () => {
  const { service, tables } = fakeService(seedMission({
    Clip: [
      { id: "clip-1", owner_id: "owner-1", source_url: "https://shop.example/1" },
      { id: "clip-2", owner_id: "owner-1", source_url: "https://shop.example/2" },
      { id: "clip-orphan", owner_id: "owner-1", source_url: "https://shop.example/3", mission_id: "mission-1", routing_status: "needs_review", status: "needs_review" },
    ],
  }));

  await removeMission(service, "owner-1", "mission-1");

  assertEquals(tables.Clip.map((row) => row.id), ["clip-orphan"], "a hint-only needs_review Clip must not be deleted by Project deletion");
});
