import {
  calculateNextCheck,
  claimWatches,
  processWatch,
  selectDueWatches,
  sweepDueWatches,
  SWEEP_CLAIM_WINDOW_MS,
} from "../base44/shared/watch-sweep.ts";

function assert(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

function assertEquals(actual: unknown, expected: unknown, message: string) {
  if (actual !== expected) throw new Error(`${message}\nexpected: ${JSON.stringify(expected)}\nactual:   ${JSON.stringify(actual)}`);
}

type FakeState = {
  watches: Map<string, any>;
  records: Map<string, any>;
  enrichments: any[];
  usageEvents: any[];
};

function fakeBase44(watches: any[], records: any[] = []) {
  const state: FakeState = {
    watches: new Map(watches.map((watch) => [watch.id, { ...watch }])),
    records: new Map(records.map((record) => [record.id, { ...record }])),
    enrichments: [],
    usageEvents: [],
  };
  const WatchRule = {
    filter: async (query: Record<string, unknown>, sort: string, limit: number) => {
      return [...state.watches.values()]
        .filter((watch) => Object.entries(query).every(([key, value]) => watch[key] === value))
        .sort((a, b) => new Date(a.next_check_at || 0).getTime() - new Date(b.next_check_at || 0).getTime())
        .slice(0, limit);
    },
    update: async (id: string, patch: Record<string, unknown>) => {
      const watch = state.watches.get(id);
      Object.assign(watch, patch);
      return watch;
    },
  };
  const Record = {
    get: async (id: string) => state.records.get(id) ?? null,
    update: async (id: string, patch: Record<string, unknown>) => {
      const record = state.records.get(id);
      Object.assign(record, patch);
      return record;
    },
  };
  const Enrichment = {
    bulkCreate: async (items: any[]) => state.enrichments.push(...items),
  };
  const UsageEvent = {
    filter: async (query: Record<string, unknown>) =>
      state.usageEvents.filter((row) => Object.entries(query).every(([key, value]) => row[key] === value)),
    create: async (row: any) => {
      state.usageEvents.push(row);
      return row;
    },
  };
  const base44 = { asServiceRole: { entities: { WatchRule, Record, Enrichment, UsageEvent } } };
  return { base44, state };
}

function page(body: string) {
  return new Response(`<html><body>${body} ${"trusted source content ".repeat(3)}</body></html>`, {
    headers: { "content-type": "text/html" },
  });
}

Deno.test("calculateNextCheck maps frequency to the right base interval", () => {
  const from = new Date("2026-01-01T00:00:00.000Z");
  assertEquals(calculateNextCheck("hourly", 0, from), "2026-01-01T01:00:00.000Z", "hourly is +1h");
  assertEquals(calculateNextCheck("daily", 0, from), "2026-01-02T00:00:00.000Z", "daily is +24h");
  assertEquals(calculateNextCheck("weekly", 0, from), "2026-01-08T00:00:00.000Z", "weekly is +168h");
});

Deno.test("calculateNextCheck backs off exponentially and caps the multiplier at 16x", () => {
  const from = new Date("2026-01-01T00:00:00.000Z");
  assertEquals(calculateNextCheck("hourly", 1, from), "2026-01-01T02:00:00.000Z", "1 failure is 2x");
  assertEquals(calculateNextCheck("hourly", 2, from), "2026-01-01T04:00:00.000Z", "2 failures is 4x");
  assertEquals(calculateNextCheck("hourly", 4, from), "2026-01-01T16:00:00.000Z", "4 failures is 16x");
  assertEquals(calculateNextCheck("hourly", 9, from), "2026-01-01T16:00:00.000Z", "the multiplier never exceeds 16x however high failure_count climbs");
});

Deno.test("selectDueWatches only returns active watches whose next_check_at has passed (or is unset)", async () => {
  const now = Date.parse("2026-01-01T12:00:00.000Z");
  const { base44 } = fakeBase44([
    { id: "due", active: true, next_check_at: "2026-01-01T11:00:00.000Z" },
    { id: "future", active: true, next_check_at: "2026-01-01T13:00:00.000Z" },
    { id: "unset", active: true, next_check_at: null },
    { id: "paused", active: false, next_check_at: "2026-01-01T11:00:00.000Z" },
  ]);
  const due = await selectDueWatches(base44.asServiceRole.entities, 20, now);
  const ids = due.map((watch: any) => watch.id).sort();
  assertEquals(JSON.stringify(ids), JSON.stringify(["due", "unset"]), "only active + due/unset watches are selected");
});

Deno.test("claimWatches pushes next_check_at into the claim window for exactly the given watches", async () => {
  const now = Date.parse("2026-01-01T12:00:00.000Z");
  const { base44, state } = fakeBase44([
    { id: "a", active: true, next_check_at: "2026-01-01T11:00:00.000Z" },
    { id: "b", active: true, next_check_at: "2026-01-01T11:00:00.000Z" },
  ]);
  await claimWatches(base44.asServiceRole.entities, [state.watches.get("a")], now);
  assertEquals(state.watches.get("a").next_check_at, new Date(now + SWEEP_CLAIM_WINDOW_MS).toISOString(), "claimed watch moves to the claim horizon");
  assertEquals(state.watches.get("b").next_check_at, "2026-01-01T11:00:00.000Z", "an unclaimed watch is untouched");
});

Deno.test("sweepDueWatches claims the whole batch before a concurrent sweep could re-select any of it", async () => {
  const now = Date.parse("2026-01-01T12:00:00.000Z");
  const { base44, state } = fakeBase44(
    [
      { id: "w1", active: true, next_check_at: "2026-01-01T11:00:00.000Z", frequency: "hourly", record_id: "r1", failure_count: 0, owner_id: "owner-1" },
      { id: "w2", active: true, next_check_at: "2026-01-01T11:00:00.000Z", frequency: "hourly", record_id: "r2", failure_count: 0, owner_id: "owner-1" },
    ],
    [
      { id: "r1", owner_id: "owner-1", source_url: "https://example.test/1", fields_json: JSON.stringify({ price: "$50" }) },
      { id: "r2", owner_id: "owner-1", source_url: "https://example.test/2", fields_json: JSON.stringify({ price: "$50" }) },
    ],
  );
  const fetchImpl = (async () => page("Price $50")) as typeof fetch;
  const original = Date.now;
  Date.now = () => now;
  try {
    const result = await sweepDueWatches(base44, 20, fetchImpl);
    assertEquals(result.processed, 2, "both due watches are processed");
    assertEquals(state.usageEvents.length, 2, "a real direct-source check records one usage event per watch");
    assertEquals(state.usageEvents.every((row) => row.operation === "watch_check"), true, "recorded events are tagged watch_check");
    // Simulate a second sweep invocation racing in right after the first one
    // claimed but before/while it was still doing the real work -- with the
    // claim in place, it must see nothing left to do.
    const concurrentSelection = await selectDueWatches(base44.asServiceRole.entities, 20, now);
    assertEquals(concurrentSelection.length, 0, "a concurrent sweep must not re-select already-claimed watches");
  } finally {
    Date.now = original;
  }
});

Deno.test("processWatch: zyte strategy records a blocked outcome and backs off without calling enrichRecord", async () => {
  const { base44, state } = fakeBase44([
    { id: "w1", active: true, frequency: "daily", record_id: "r1", failure_count: 0, acquisition_strategy: "zyte", owner_id: "owner-1" },
  ]);
  const result: any = await processWatch(base44, base44.asServiceRole.entities, state.watches.get("w1"));
  assertEquals(result.strategy, "zyte", "outcome reports the zyte strategy");
  assertEquals(result.blocked, true, "zyte is reported as blocked");
  assertEquals(state.watches.get("w1").failure_count, 1, "a zyte attempt still counts as a failure for backoff purposes");
  assertEquals(state.usageEvents.length, 0, "a stubbed, never-sent zyte request must not be recorded as billable usage");
});

Deno.test("processWatch: owner_browser strategy waits without incrementing failure_count", async () => {
  const { base44, state } = fakeBase44([
    { id: "w1", active: true, frequency: "daily", record_id: "r1", failure_count: 0, acquisition_strategy: "owner_browser", owner_id: "owner-1" },
  ]);
  const result: any = await processWatch(base44, base44.asServiceRole.entities, state.watches.get("w1"));
  assertEquals(result.outcome, "waiting_for_owner_browser", "reports the waiting state");
  assertEquals(state.watches.get("w1").failure_count, 0, "owner_browser does not touch failure_count");
  assertEquals(state.usageEvents.length, 0, "no source was fetched, so no usage event is recorded");
});

Deno.test("processWatch: an unexpected throw during direct_http is recorded as failed with backoff, not left unresolved", async () => {
  const { base44, state } = fakeBase44(
    [{ id: "w1", active: true, frequency: "hourly", record_id: "missing-record", failure_count: 2 }],
    [],
  );
  const result: any = await processWatch(base44, base44.asServiceRole.entities, state.watches.get("w1"));
  assertEquals(result.outcome, "failed", "a thrown error (e.g. record not found) is caught and reported, not left to crash the batch");
  assertEquals(state.watches.get("w1").failure_count, 3, "failure_count still increments on an unexpected exception");
  assertEquals(state.watches.get("w1").last_error_code, "UNEXPECTED_CHECK_FAILURE", "the error is tagged with a stable code");
});
