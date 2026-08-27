import { assertEquals } from "jsr:@std/assert";
import { recordUsageEvent } from "../base44/shared/usage.ts";

function fakeBase44() {
  const rows: any[] = [];
  const UsageEvent = {
    filter: async (query: Record<string, unknown>) => {
      return rows.filter((row) => Object.entries(query).every(([key, value]) => row[key] === value));
    },
    create: async (row: any) => {
      rows.push(row);
      return row;
    },
  };
  return { base44: { asServiceRole: { entities: { UsageEvent } } }, rows };
}

Deno.test("recordUsageEvent writes a normalized row for a valid capture event", async () => {
  const { base44, rows } = fakeBase44();
  const ok = await recordUsageEvent(base44, {
    owner_id: "owner-1",
    operation: "capture",
    outcome: "success",
    idempotency_key: "clip:c1",
  });
  assertEquals(ok, true);
  assertEquals(rows.length, 1);
  assertEquals(rows[0].owner_id, "owner-1");
  assertEquals(rows[0].operation, "capture");
  assertEquals(rows[0].provider, "base44");
  assertEquals(rows[0].units, 1);
  assertEquals(rows[0].outcome, "success");
  assertEquals(rows[0].idempotency_key, "clip:c1");
  assertEquals(typeof rows[0].occurred_at, "string");
});

Deno.test("recordUsageEvent is idempotent: retrying the same key never double-writes", async () => {
  const { base44, rows } = fakeBase44();
  await recordUsageEvent(base44, {
    owner_id: "owner-1",
    operation: "watch_check",
    outcome: "success",
    idempotency_key: "watch:w1:2026-01-01T00:00:00.000Z",
  });
  const second = await recordUsageEvent(base44, {
    owner_id: "owner-1",
    operation: "watch_check",
    outcome: "success",
    idempotency_key: "watch:w1:2026-01-01T00:00:00.000Z",
  });
  assertEquals(second, true, "a deduped retry still reports success to the caller");
  assertEquals(rows.length, 1, "only one row is ever written for the same idempotency key");
});

Deno.test("recordUsageEvent rejects an unknown operation without writing", async () => {
  const { base44, rows } = fakeBase44();
  const ok = await recordUsageEvent(base44, {
    owner_id: "owner-1",
    operation: "not_a_real_operation" as never,
    outcome: "success",
  });
  assertEquals(ok, false);
  assertEquals(rows.length, 0);
});

Deno.test("recordUsageEvent rejects a missing owner_id without writing", async () => {
  const { base44, rows } = fakeBase44();
  const ok = await recordUsageEvent(base44, {
    owner_id: "" as never,
    operation: "ask",
    outcome: "success",
  });
  assertEquals(ok, false);
  assertEquals(rows.length, 0);
});

Deno.test("recordUsageEvent never throws when the backing entity is unavailable", async () => {
  const base44 = { asServiceRole: { entities: {} } };
  const ok = await recordUsageEvent(base44, {
    owner_id: "owner-1",
    operation: "capture",
    outcome: "success",
  });
  assertEquals(ok, false, "a missing entity surfaces as a clean false, never a thrown error");
});

Deno.test("recordUsageEvent falls back to provider base44 and units 1 for out-of-range input", async () => {
  const { base44, rows } = fakeBase44();
  await recordUsageEvent(base44, {
    owner_id: "owner-1",
    operation: "cloud_check",
    provider: "not_a_provider" as never,
    units: -5,
    outcome: "success",
  });
  assertEquals(rows[0].provider, "base44");
  assertEquals(rows[0].units, 1);
});
