import { assertEquals, assertMatch } from "jsr:@std/assert";
import { errorResponse, HttpError } from "../base44/shared/http.ts";
import {
  captureSentryEvent,
  captureSentryTransaction,
  classifyError,
  createDiagnosticContext,
  createRequestId,
  diagnosticDurationMs,
  diagnosticStageSpans,
  redactLogValue,
  serializeLogEvent,
  setDiagnosticStage,
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
  const value = redactLogValue("Bearer mp_abcdefghijklmnopqrstuv1234567890 sent to user@example.com url=https://example.test/path?token=secret");
  assertEquals(value.includes("mp_abcdefghijkl"), false);
  assertEquals(value.includes("user@example.com"), false);
  assertEquals(value.includes("https://example.test"), false);
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
    stage_started_at_ms: 1_000,
  });
  assertEquals(diagnosticDurationMs(context, 1_321), 321);
});

Deno.test("diagnostic stages become bounded Sentry transaction spans", async () => {
  const context = createDiagnosticContext(undefined, "ingest-clip", "capture", 1_000);
  setDiagnosticStage(context, "auth", 1_100);
  setDiagnosticStage(context, "storage", 1_250);
  assertEquals(diagnosticStageSpans(context, 1_500), [
    { name: "request", duration_ms: 100 },
    { name: "auth", duration_ms: 150 },
    { name: "storage", duration_ms: 250 },
  ]);

  let body = "";
  const sent = await captureSentryTransaction({
    event: "capture.request.finished",
    request_id: context.request_id,
    status: 202,
    error_code: "NONE",
    outcome: "success",
    environment: "production",
  }, context, "https://public@example.ingest.sentry.io/12345", async (_input, init) => {
    body = String(init?.body);
    return new Response(null, { status: 200 });
  });
  const payload = JSON.parse(body.split("\n")[2]);
  assertEquals(sent, true);
  assertEquals(payload.type, "transaction");
  assertEquals(payload.tags.request_id, context.request_id);
  assertEquals(payload.spans.map((span: { description: string }) => span.description), ["request", "auth", "storage"]);
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
  assertEquals(record.error_code, "NONE");
  assertEquals((record as Record<string, unknown>).raw_text, undefined);
});
Deno.test("captureSentryEvent sends only redacted operational fields to the configured DSN", async () => {
  let capturedUrl = "";
  let capturedBody: Record<string, unknown> | undefined;
  const result = await captureSentryEvent({
    event: "function.request.error",
    request_id: "req_sentry_12345678",
    function_name: "ingest-clip",
    operation: "capture",
    stage: "storage",
    status: 429,
    error_code: "RATE_LIMITED",
    message: "Bearer mp_secret-token user@example.com",
    duration_ms: 412,
    outcome: "error",
    environment: "production",
    raw_text: "must not be sent",
  }, "https://public@example.ingest.sentry.io/12345", async (input: Request | URL | string, init?: RequestInit) => {
    capturedUrl = String(input);
    const lines = String(init?.body).split("\n");
    capturedBody = JSON.parse(lines[2]);
    return new Response(null, { status: 200 });
  });

  assertEquals(result, true);
  assertMatch(capturedUrl, /\/api\/12345\/envelope\//);
  assertEquals(capturedBody?.message, { formatted: "[REDACTED] [REDACTED]" });
  assertEquals(capturedBody?.tags, {
    function_name: "ingest-clip",
    operation: "capture",
    stage: "storage",
    error_code: "RATE_LIMITED",
    environment: "production",
    runtime: "backend",
  });
  assertEquals(capturedBody?.extra, {
    request_id: "req_sentry_12345678",
    status: 429,
    duration_ms: 412,
  });
  assertEquals((capturedBody as Record<string, unknown>).raw_text, undefined);
});

Deno.test("captureSentryEvent is a no-op without a DSN and never throws on transport failure", async () => {
  assertEquals(await captureSentryEvent({ event: "test" }, "", fetch), false);
  assertEquals(await captureSentryEvent({ event: "test" }, "https://public@example.ingest.sentry.io/12345", async () => {
    throw new Error("network down");
  }), false);
});
Deno.test("errorResponse returns status and a correlation id for safe client diagnostics", async () => {
  const response = await errorResponse(new HttpError(429, "Rate limit exceeded"), new Request("https://example.test/functions/ingest-clip", {
    headers: { "x-request-id": "req_client_12345678" },
  }));
  assertEquals(response.status, 429);
  assertEquals(response.headers.get("x-request-id"), "req_client_12345678");
  assertEquals(await response.json(), { error: "Rate limit exceeded", request_id: "req_client_12345678" });
});
