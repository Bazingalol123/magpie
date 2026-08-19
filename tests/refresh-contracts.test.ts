import { assert, assertEquals, assertFalse } from "jsr:@std/assert";
import {
  buildRefreshAttemptKey,
  buildRefreshDiagnostic,
  type AcquisitionResult,
} from "../base44/shared/refresh-contracts.ts";
import { serializeLogEvent } from "../base44/shared/observability.ts";

Deno.test("buildRefreshAttemptKey is deterministic and bounded", () => {
  const input = {
    watchId: "watch-123",
    recordId: "record-456",
    scheduledAt: "2026-08-19T12:00:00.000Z",
    strategy: "direct_http" as const,
  };

  assertEquals(buildRefreshAttemptKey(input), buildRefreshAttemptKey(input));
  assert(buildRefreshAttemptKey(input).startsWith("refresh_"));
  assert(buildRefreshAttemptKey({
    ...input,
    watchId: "x".repeat(500),
  }).length <= 240);
});

Deno.test("buildRefreshDiagnostic keeps refresh correlation and excludes source payload", () => {
  const result: AcquisitionResult = {
    status: "blocked",
    strategy: "direct_http",
    retryable: true,
    errorCode: "SOURCE_CHALLENGE",
  };

  const event = buildRefreshDiagnostic({
    event: "refresh.provider.finished",
    requestId: "req_refresh_12345678",
    attemptId: "attempt-123",
    watchId: "watch-123",
    recordId: "record-456",
    strategy: result.strategy,
    result,
    sourceUrl: "https://example.test/private?token=secret",
    ownerId: "owner-private",
  });

  assertEquals(event.attempt_id, "attempt-123");
  assertEquals(event.watch_id, "watch-123");
  assertEquals(event.record_id, "record-456");
  assertEquals(event.strategy, "direct_http");
  assertEquals(event.outcome, "blocked");
  assertEquals(event.error_code, "SOURCE_CHALLENGE");
  assertFalse("source_url" in event);
  assertFalse("owner_id" in event);
  assertFalse(JSON.stringify(event).includes("token=secret"));
});

Deno.test("structured logging preserves refresh correlation fields but not source payload", () => {
  const event = serializeLogEvent({
    event: "refresh.provider.finished",
    request_id: "req_refresh_12345678",
    attempt_id: "attempt-123",
    watch_id: "watch-123",
    record_id: "record-456",
    strategy: "zyte",
    provider_request_id: "provider-123",
    outcome: "success",
    source_url: "https://example.test/private",
  });

  assertEquals(event.attempt_id, "attempt-123");
  assertEquals(event.watch_id, "watch-123");
  assertEquals(event.record_id, "record-456");
  assertEquals(event.strategy, "zyte");
  assertEquals(event.provider_request_id, "provider-123");
  assertFalse("source_url" in event);
});
Deno.test("buildRefreshDiagnostic records successful provider metadata without raw evidence", () => {
  const result: AcquisitionResult = {
    status: "success",
    strategy: "zyte",
    retryable: false,
    providerRequestId: "provider-request-123",
    evidenceHash: "sha256:abc123",
  };

  const event = buildRefreshDiagnostic({
    event: "refresh.provider.finished",
    requestId: "req_refresh_12345678",
    attemptId: "attempt-789",
    watchId: "watch-789",
    recordId: "record-789",
    strategy: result.strategy,
    result,
  });

  assertEquals(event.outcome, "success");
  assertEquals(event.provider_request_id, "provider-request-123");
  assertEquals(event.evidence_hash, "sha256:abc123");
  assertFalse("evidence" in event);
  assertFalse("raw_text" in event);
});
