import { assertEquals, assertMatch } from "jsr:@std/assert";
import { errorResponse, HttpError } from "../base44/shared/http.ts";
import {
  classifyError,
  createDiagnosticContext,
  createRequestId,
  diagnosticDurationMs,
  redactLogValue,
  serializeLogEvent,
  toDiagnosticRecord,
} from "../base44/shared/observability.ts";

Deno.test("createRequestId returns a non-secret correlation id", () => {
  const requestId = createRequestId();
  assertMatch(requestId, /^req_[A-Za-z0-9_-]{16,}$/);
  assertEquals(requestId.includes("@"), false);
});

Deno.test("classifyError preserves HTTP status and stable error code", () => {
  const result = classifyError({ status: 429, message: "Rate limit exceeded" });
  assertEquals(result, {
    status: 429,
    error_code: "RATE_LIMITED",
    message: "Rate limit exceeded",
  });
});

Deno.test("serializeLogEvent emits bounded structured diagnostics without secrets or payloads", () => {
  const event = serializeLogEvent({
    event: "function.request.finished",
    function_name: "ingest-clip",
    request_id: "req_test_1234567890",
    owner_id: "owner-secret",
    email: "chama@osoprodawok.com",
    authorization: "Bearer mp_super-secret-token",
    raw_text: "private customer text",
    status: 429,
    duration_ms: 321,
    error_code: "RATE_LIMITED",
  });

  assertEquals(event.event, "function.request.finished");
  assertEquals(event.status, 429);
  assertEquals(event.duration_ms, 321);
  const safeEvent = event as Record<string, unknown>;
  assertEquals(safeEvent.owner_id, undefined);
  assertEquals(safeEvent.email, undefined);
  assertEquals(safeEvent.authorization, undefined);
  assertEquals(safeEvent.raw_text, undefined);
  assertEquals(event.error_code, "RATE_LIMITED");
});

Deno.test("redactLogValue removes bearer tokens and email addresses", () => {
  const value = redactLogValue("Bearer mp_abcdefghijklmnopqrstuv1234567890 sent to user@example.com");
  assertEquals(value.includes("mp_abcdefghijkl"), false);
  assertEquals(value.includes("user@example.com"), false);
  assertEquals(value.includes("[REDACTED]"), true);
});

Deno.test("toDiagnosticRecord stores only bounded operational fields with an expiry", () => {
  const record = toDiagnosticRecord({
    event: "function.request.error",
    request_id: "req_test_1234567890",
    function_name: "ingest-clip",
    status: 429,
    error_code: "RATE_LIMITED",
    message: "Bearer mp_secret-token user@example.com",
    duration_ms: 321,
    environment: "production",
  }, new Date("2026-08-18T19:00:00.000Z"));

  assertEquals(record, {
    event: "function.request.error",
    request_id: "req_test_1234567890",
    function_name: "ingest-clip",
    status: 429,
    error_code: "RATE_LIMITED",
    message: "[REDACTED] [REDACTED]",
    duration_ms: 321,
    environment: "production",
    occurred_at: "2026-08-18T19:00:00.000Z",
    expires_at: "2026-08-25T19:00:00.000Z",
  });
});
Deno.test("diagnostic context keeps one request id and reports bounded duration", () => {
  const context = createDiagnosticContext(
    new Request("https://example.test/functions/ingest-clip", {
      headers: { "x-request-id": "req_capture_12345678" },
    }),
    "ingest-clip",
    "capture",
    1_000,
  );

  assertEquals(context, {
    request_id: "req_capture_12345678",
    function_name: "ingest-clip",
    operation: "capture",
    started_at_ms: 1_000,
    stage: "request",
  });
  assertEquals(diagnosticDurationMs(context, 1_321), 321);
});

Deno.test("success diagnostic records contain outcome and stage without payload data", () => {
  const record = toDiagnosticRecord({
    event: "capture.request.finished",
    request_id: "req_capture_12345678",
    function_name: "ingest-clip",
    operation: "capture",
    stage: "routing",
    status: 202,
    duration_ms: 321,
    outcome: "success",
    environment: "production",
    raw_text: "must not be stored",
  }, new Date("2026-08-18T19:00:00.000Z"));

  assertEquals(record.stage, "routing");
  assertEquals(record.outcome, "success");
  assertEquals((record as Record<string, unknown>).raw_text, undefined);
});
Deno.test("errorResponse returns status and a correlation id for safe client diagnostics", async () => {
  const response = await errorResponse(new HttpError(429, "Rate limit exceeded"), new Request("https://example.test/functions/ingest-clip", {
    headers: { "x-request-id": "req_client_12345678" },
  }));
  assertEquals(response.status, 429);
  assertEquals(response.headers.get("x-request-id"), "req_client_12345678");
  assertEquals(await response.json(), { error: "Rate limit exceeded", request_id: "req_client_12345678" });
});
