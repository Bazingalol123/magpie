import { assert, assertEquals, assertFalse } from "jsr:@std/assert";
import {
  buildLeaseClaim,
  isRefreshAttemptClaimable,
  type RefreshAttempt,
} from "../base44/shared/refresh-leases.ts";

const baseAttempt: RefreshAttempt = {
  id: "attempt-1",
  owner_id: "owner-1",
  watch_id: "watch-1",
  record_id: "record-1",
  strategy: "owner_browser",
  status: "queued",
  attempt_key: "refresh-key",
  source_url: "https://example.test/item",
  requested_at: "2026-08-19T12:00:00.000Z",
};

Deno.test("queued owner-browser attempt is claimable", () => {
  assert(isRefreshAttemptClaimable(baseAttempt, 1_000));
});

Deno.test("unexpired claimed attempt is not claimable", () => {
  assertFalse(isRefreshAttemptClaimable({
    ...baseAttempt,
    status: "claimed",
    lease_expires_at: "2026-08-19T12:00:10.000Z",
  }, Date.parse("2026-08-19T12:00:05.000Z")));
});

Deno.test("expired claimed attempt becomes claimable", () => {
  assert(isRefreshAttemptClaimable({
    ...baseAttempt,
    status: "claimed",
    lease_expires_at: "2026-08-19T12:00:10.000Z",
  }, Date.parse("2026-08-19T12:00:11.000Z")));
});

Deno.test("expired running attempt becomes claimable", () => {
  assert(isRefreshAttemptClaimable({
    ...baseAttempt,
    status: "running",
    lease_expires_at: "2026-08-19T12:00:10.000Z",
  }, Date.parse("2026-08-19T12:00:11.000Z")));
});
Deno.test("claim update records bounded worker and lease metadata", () => {
  const claim = buildLeaseClaim(baseAttempt, {
    workerId: "pairing-1",
    leaseId: "lease-1",
    nowMs: Date.parse("2026-08-19T12:00:00.000Z"),
    leaseMs: 60_000,
  });

  assertEquals(claim, {
    status: "claimed",
    claimed_by: "pairing-1",
    lease_id: "lease-1",
    lease_expires_at: "2026-08-19T12:01:00.000Z",
    started_at: "2026-08-19T12:00:00.000Z",
  });
});

Deno.test("claim update rejects an unclaimable attempt", () => {
  const claimed = {
    ...baseAttempt,
    status: "claimed" as const,
    claimed_by: "other-worker",
    lease_id: "other-lease",
    lease_expires_at: "2026-08-19T12:01:00.000Z",
  };

  let thrown = false;
  try {
    buildLeaseClaim(claimed, {
      workerId: "pairing-1",
      leaseId: "lease-1",
      nowMs: Date.parse("2026-08-19T12:00:30.000Z"),
      leaseMs: 60_000,
    });
  } catch {
    thrown = true;
  }
  assert(thrown);
});
