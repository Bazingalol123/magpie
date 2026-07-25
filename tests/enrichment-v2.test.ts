import { enrichRecord } from "../base44/shared/enrichment-v2.ts";

type FakeState = {
  record: Record<string, unknown>;
  updates: Array<Record<string, unknown>>;
  enrichments: Array<Record<string, unknown>>;
};

function fakeBase44(fields: Record<string, unknown>) {
  const state: FakeState = {
    record: {
      id: "record-1",
      owner_id: "owner-1",
      source_url: "https://example.test/item",
      fields_json: JSON.stringify(fields),
      consecutive_check_failures: 0,
    },
    updates: [],
    enrichments: [],
  };
  const base44 = {
    asServiceRole: {
      entities: {
        Record: {
          get: async () => state.record,
          update: async (_id: string, update: Record<string, unknown>) => {
            state.updates.push(update);
            Object.assign(state.record, update);
          },
        },
        Enrichment: {
          bulkCreate: async (items: Array<Record<string, unknown>>) => state.enrichments.push(...items),
        },
      },
    },
  };
  return { base44, state };
}

function page(body: string, status = 200, contentType = "text/html") {
  return new Response(`<html><body>${body} ${"trusted source content ".repeat(3)}</body></html>`, {
    status,
    headers: { "content-type": contentType },
  });
}

function assert(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

Deno.test("changed: trusted price creates one audit row", async () => {
  const { base44, state } = fakeBase44({ price: "$50", availability: "In stock" });
  const result = await enrichRecord(base44, "record-1", async () => page("Price $40. In stock and ready to ship."));
  assert(result.status === "changed", "expected changed");
  assert(result.changeCount === 1, "expected one semantic change");
  assert(state.enrichments.length === 1, "expected one audit row");
});

Deno.test("unchanged: equivalent money formatting does not create noise", async () => {
  const { base44, state } = fakeBase44({ price: "$50.00" });
  const result = await enrichRecord(base44, "record-1", async () => page("Current price USD 50"));
  assert(result.status === "unchanged", "expected unchanged");
  assert(state.enrichments.length === 0, "expected no audit rows");
});

for (const fixture of [
  { name: "blocked", response: () => page("Access denied", 403), expected: "blocked" },
  { name: "not found", response: () => page("Page not found", 404), expected: "not_found" },
  { name: "rate limited", response: () => page("Try later", 429), expected: "rate_limited" },
  { name: "invalid content", response: () => page('{"value": 1}', 200, "application/json"), expected: "invalid_content" },
]) {
  Deno.test(`${fixture.name}: persists state without mutating fields`, async () => {
    const { base44, state } = fakeBase44({ price: "$50" });
    const originalFields = state.record.fields_json;
    const result = await enrichRecord(base44, "record-1", async () => fixture.response());
    assert(result.status === fixture.expected, `expected ${fixture.expected}`);
    assert(state.record.fields_json === originalFields, "fields must remain unchanged");
    assert(state.enrichments.length === 0, "expected no audit rows");
  });
}

Deno.test("unreachable: network exceptions become retryable outcomes", async () => {
  const { base44, state } = fakeBase44({ price: "$50" });
  const result = await enrichRecord(base44, "record-1", async () => {
    throw new TypeError("network failure");
  });
  assert(result.status === "unreachable" && result.retryable, "expected retryable unreachable");
  assert(state.enrichments.length === 0, "expected no audit rows");
});

Deno.test("unsupported fields: document title is never candidate evidence", async () => {
  const { base44, state } = fakeBase44({ title: "Original candidate", company: "Acme" });
  const result = await enrichRecord(base44, "record-1", async () => page("<title>Unrelated page title</title>"));
  assert(result.status === "no_extractable_fields", "expected unsupported outcome");
  assert(state.enrichments.length === 0, "title must not create an audit row");
});

Deno.test("suspicious values: implausible jumps are ignored", async () => {
  const { base44, state } = fakeBase44({ price: "$100" });
  const result = await enrichRecord(base44, "record-1", async () => page("Current price $9,999"));
  assert(result.status === "suspicious_data", "expected suspicious_data");
  assert(state.enrichments.length === 0, "suspicious values must not create audit rows");
});

Deno.test("blocked watches auto-pause only at three consecutive blocked checks", async () => {
  const { shouldAutoPauseWatch } = await import("../base44/shared/enrichment-v2.ts");
  const cases: Array<[string, boolean, number, boolean]> = [
    ["blocked", false, 3, true],
    ["blocked", false, 5, true],
    ["blocked", false, 2, false],
    ["blocked", true, 3, false],
    ["unreachable", true, 6, false],
    ["not_found", false, 4, false],
    ["changed", true, 0, false],
  ];
  for (const [status, retryable, failureCount, expected] of cases) {
    const actual = shouldAutoPauseWatch(status, retryable, failureCount);
    if (actual !== expected) {
      throw new Error(`shouldAutoPauseWatch(${status}, ${retryable}, ${failureCount}) = ${actual}, expected ${expected}`);
    }
  }
});

Deno.test("refresh: browser-supplied text updates fields with an audit row", async () => {
  const { refreshRecordFromEvidence } = await import("../base44/shared/enrichment-v2.ts");
  const { base44, state } = fakeBase44({ price: "$50", availability: "In stock" });
  const result = await refreshRecordFromEvidence(base44, state.record, "Price $40. In stock and ready to ship. trusted source content");
  assert(result.status === "updated", "expected updated");
  assert(result.changeCount === 1, "expected one change");
  assert(state.enrichments.length === 1, "expected one audit row");
  assert(state.enrichments[0].agent_id === "extension-refresh-v1", "expected refresh agent id");
  assert(state.record.freshness === "fresh", "expected restored freshness");
});

Deno.test("refresh: equivalent values verify freshness without noise", async () => {
  const { refreshRecordFromEvidence } = await import("../base44/shared/enrichment-v2.ts");
  const { base44, state } = fakeBase44({ price: "$50.00" });
  state.record.freshness = "blocked";
  const result = await refreshRecordFromEvidence(base44, state.record, "Current price USD 50 trusted content");
  assert(result.status === "unchanged", "expected unchanged");
  assert(state.enrichments.length === 0, "expected no audit rows");
  assert(state.record.freshness === "fresh", "a verified visit restores freshness");
});

Deno.test("refresh: suspicious values mutate nothing at all", async () => {
  const { refreshRecordFromEvidence } = await import("../base44/shared/enrichment-v2.ts");
  const { base44, state } = fakeBase44({ price: "$50" });
  const originalFields = state.record.fields_json;
  const result = await refreshRecordFromEvidence(base44, state.record, "Price $2. Unbelievable clearance!");
  assert(result.status === "suspicious", "expected suspicious");
  assert(state.record.fields_json === originalFields, "fields must remain unchanged");
  assert(state.updates.length === 0, "record must not be updated at all");
  assert(state.enrichments.length === 0, "expected no audit rows");
});

Deno.test("refresh: reactivates an auto-paused watch and resets failures", async () => {
  const { reactivateWatchesAfterRefresh } = await import("../base44/shared/enrichment-v2.ts");
  const watches: Array<Record<string, unknown>> = [
    { id: "watch-1", owner_id: "owner-1", record_id: "record-1", active: false, last_error_code: "AUTO_PAUSED_BLOCKED", failure_count: 4 },
    { id: "watch-2", owner_id: "owner-1", record_id: "record-1", active: true, last_error_code: "", failure_count: 2 },
    { id: "watch-3", owner_id: "owner-2", record_id: "record-1", active: false, last_error_code: "AUTO_PAUSED_BLOCKED", failure_count: 4 },
  ];
  const service = {
    WatchRule: {
      filter: async (query: Record<string, unknown>) =>
        watches.filter((watch) => watch.owner_id === query.owner_id && watch.record_id === query.record_id),
      update: async (id: string, changes: Record<string, unknown>) => {
        const watch = watches.find((item) => item.id === id)!;
        Object.assign(watch, changes);
        return watch;
      },
    },
  };

  await reactivateWatchesAfterRefresh(service, "owner-1", "record-1");

  assert(watches[0].active === true, "auto-paused watch must reactivate");
  assert(watches[0].failure_count === 0, "failure count must reset");
  assert(Boolean(watches[0].next_check_at), "reactivated watch needs a next check time");
  assert(watches[1].failure_count === 0, "healthy watch failures reset too");
  assert(watches[2].active === false, "cross-owner watch must not be touched");
});
