const MAX_MESSAGE_LENGTH = 240;
const REDACTED = "[REDACTED]";

const STATUS_CODES: Record<number, string> = {
  400: "INVALID_REQUEST",
  401: "AUTHENTICATION_REQUIRED",
  403: "FORBIDDEN",
  404: "NOT_FOUND",
  405: "METHOD_NOT_ALLOWED",
  409: "CONFLICT",
  413: "PAYLOAD_TOO_LARGE",
  415: "UNSUPPORTED_MEDIA_TYPE",
  422: "INVALID_REQUEST",
  429: "RATE_LIMITED",
};

export type StructuredLogEvent = {
  event: string;
  request_id?: string;
  function_name?: string;
  operation?: string;
  stage?: string;
  status?: number;
  duration_ms?: number;
  error_code?: string;
  message?: string;
  retry_after_seconds?: number;
  outcome?: string;
};

export function createRequestId() {
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  const encoded = btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
  return `req_${encoded}`;
}

export function requestIdFrom(request: Request | undefined) {
  const supplied = request?.headers.get("x-request-id")?.trim();
  return supplied && /^[A-Za-z0-9_-]{8,100}$/.test(supplied) ? supplied : createRequestId();
}

export type DiagnosticContext = {
  request_id: string;
  function_name: string;
  operation: string;
  started_at_ms: number;
  stage: string;
  stage_started_at_ms?: number;
  stage_history?: Array<{ name: string; duration_ms: number }>;
};

export function createDiagnosticContext(request: Request | undefined, functionName: string, operation: string, startedAtMs = Date.now()): DiagnosticContext {
  return {
    request_id: requestIdFrom(request),
    function_name: functionName.slice(0, 80),
    operation: operation.slice(0, 80),
    started_at_ms: startedAtMs,
    stage: "request",
    stage_started_at_ms: startedAtMs,
  };
}

export function setDiagnosticStage(context: DiagnosticContext, stage: string, nowMs = Date.now()) {
  const nextStage = stage.slice(0, 80);
  if (context.stage_started_at_ms !== undefined) {
    context.stage_history ??= [];
    context.stage_history.push({
      name: context.stage,
      duration_ms: Math.min(Math.max(Math.round(nowMs - context.stage_started_at_ms), 0), 600_000),
    });
  }
  context.stage = nextStage;
  context.stage_started_at_ms = nowMs;
}

export function diagnosticStageSpans(context: DiagnosticContext, nowMs = Date.now()) {
  const spans = [...(context.stage_history ?? [])];
  if (context.stage_started_at_ms !== undefined) {
    spans.push({
      name: context.stage,
      duration_ms: Math.min(Math.max(Math.round(nowMs - context.stage_started_at_ms), 0), 600_000),
    });
  }
  return spans;
}
export function diagnosticDurationMs(context: DiagnosticContext, nowMs = Date.now()) {
  return Math.min(Math.max(Math.round(nowMs - context.started_at_ms), 0), 600_000);
}

export function classifyError(error: unknown) {
  const candidate = error as {
    status?: unknown;
    statusCode?: unknown;
    code?: unknown;
    message?: unknown;
    response?: { status?: unknown; data?: { code?: unknown; message?: unknown } };
  } | null;
  const rawStatus = candidate?.status ?? candidate?.statusCode ?? candidate?.response?.status;
  const status = typeof rawStatus === "number" ? rawStatus : undefined;
  const rawCode = candidate?.code ?? candidate?.response?.data?.code;
  const errorCode = typeof rawCode === "string" && /^[A-Z][A-Z0-9_]{2,80}$/.test(rawCode)
    ? rawCode
    : status ? STATUS_CODES[status] ?? (status >= 500 ? "UPSTREAM_ERROR" : "REQUEST_FAILED") : "INTERNAL_ERROR";
  const rawMessage = candidate?.message ?? candidate?.response?.data?.message;
  const message = typeof rawMessage === "string" ? redactLogValue(rawMessage).slice(0, MAX_MESSAGE_LENGTH) : "Unexpected server error";
  return { status, error_code: errorCode, message };
}

export function serializeLogEvent(input: Record<string, unknown>): StructuredLogEvent {
  const allowed = [
    "event",
    "request_id",
    "function_name",
    "operation",
    "stage",
    "status",
    "duration_ms",
    "error_code",
    "message",
    "retry_after_seconds",
    "outcome",
  ] as const;
  const event = {} as StructuredLogEvent;
  for (const key of allowed) {
    const value = input[key];
    if (value === undefined || value === null) continue;
    if (["status", "duration_ms", "retry_after_seconds"].includes(key)) {
      if (typeof value === "number" && Number.isFinite(value)) event[key] = Math.round(value) as never;
    } else if (typeof value === "string") {
      event[key] = redactLogValue(value).slice(0, MAX_MESSAGE_LENGTH) as never;
    }
  }
  return event;
}

export function toDiagnosticRecord(input: Record<string, unknown>, now = new Date()) {
  const event = serializeLogEvent(input);
  if (!event.error_code) event.error_code = input.outcome === "success" ? "NONE" : "INTERNAL_ERROR";
  const occurredAt = now.toISOString();
  return {
    ...event,
    environment: typeof input.environment === "string" ? redactLogValue(input.environment).slice(0, 32) : "production",
    occurred_at: occurredAt,
    expires_at: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1_000).toISOString(),
  };
}

export async function captureSentryEvent(
  input: Record<string, unknown>,
  dsn = Deno.env.get("SENTRY_DSN") ?? "",
  fetchImpl: typeof fetch = fetch,
) {
  const parsed = parseSentryDsn(dsn);
  if (!parsed) return false;

  const event = serializeLogEvent(input);
  const eventId = crypto.randomUUID().replaceAll("-", "");
  const endpoint = `${parsed.origin}/api/${encodeURIComponent(parsed.projectId)}/envelope/?sentry_version=7&sentry_key=${encodeURIComponent(parsed.publicKey)}&sentry_client=magpie/1.0`;
  const payload = {
    event_id: eventId,
    timestamp: Date.now() / 1_000,
    platform: "javascript",
    level: "error",
    message: { formatted: event.message ?? "Backend diagnostic error" },
    tags: Object.fromEntries([
      ["function_name", event.function_name],
      ["operation", event.operation],
      ["stage", event.stage],
      ["error_code", event.error_code],
      ["environment", input.environment],
      ["runtime", "backend"],
    ].filter(([, value]) => typeof value === "string")),
    extra: Object.fromEntries([
      ["request_id", event.request_id],
      ["status", event.status],
      ["duration_ms", event.duration_ms],
    ].filter(([, value]) => value !== undefined)),
  };
  const envelope = `${JSON.stringify({ event_id: eventId, sent_at: new Date().toISOString() })}\n${JSON.stringify({ type: "event" })}\n${JSON.stringify(payload)}\n`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 1_500);
  try {
    const response = await fetchImpl(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/x-sentry-envelope" },
      body: envelope,
      signal: controller.signal,
    });
    return response.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

export async function captureSentryTransaction(
  input: Record<string, unknown>,
  context: DiagnosticContext,
  dsn = Deno.env.get("SENTRY_DSN") ?? "",
  fetchImpl: typeof fetch = fetch,
) {
  const parsed = parseSentryDsn(dsn);
  if (!parsed) return false;

  const event = serializeLogEvent(input);
  const eventId = crypto.randomUUID().replaceAll("-", "");
  const traceId = crypto.randomUUID().replaceAll("-", "");
  const spanId = traceId.slice(0, 16);
  const nowMs = Date.now();
  let cursorMs = context.started_at_ms;
  const spans = diagnosticStageSpans(context, nowMs).map((span) => {
    const startMs = cursorMs;
    cursorMs += span.duration_ms;
    return {
      span_id: crypto.randomUUID().replaceAll("-", "").slice(0, 16),
      trace_id: traceId,
      op: "capture.stage",
      description: span.name,
      start_timestamp: startMs / 1_000,
      timestamp: cursorMs / 1_000,
      data: { duration_ms: span.duration_ms },
    };
  });
  const payload = {
    event_id: eventId,
    type: "transaction",
    transaction: `${context.function_name}.${context.operation}`,
    start_timestamp: context.started_at_ms / 1_000,
    timestamp: nowMs / 1_000,
    platform: "javascript",
    level: input.outcome === "error" ? "error" : "info",
    contexts: {
      trace: {
        trace_id: traceId,
        span_id: spanId,
        op: context.operation,
        status: input.outcome === "error" ? "internal_error" : "ok",
      },
    },
    tags: {
      runtime: "backend",
      function_name: context.function_name,
      operation: context.operation,
      request_id: context.request_id,
      error_code: event.error_code ?? "NONE",
      environment: String(input.environment ?? "production"),
    },
    extra: {
      status: event.status,
      duration_ms: diagnosticDurationMs(context, nowMs),
      message: event.message,
    },
    spans,
  };
  const envelope = `${JSON.stringify({ event_id: eventId, sent_at: new Date().toISOString() })}\n${JSON.stringify({ type: "transaction" })}\n${JSON.stringify(payload)}\n`;
  return postSentryEnvelope(parsed, envelope, fetchImpl);
}

async function postSentryEnvelope(parsed: { origin: string; publicKey: string; projectId: string }, envelope: string, fetchImpl: typeof fetch) {
  const endpoint = `${parsed.origin}/api/${encodeURIComponent(parsed.projectId)}/envelope/?sentry_version=7&sentry_key=${encodeURIComponent(parsed.publicKey)}&sentry_client=magpie/1.0`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 1_500);
  try {
    const response = await fetchImpl(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/x-sentry-envelope" },
      body: envelope,
      signal: controller.signal,
    });
    return response.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
}
function parseSentryDsn(value: string) {
  try {
    const url = new URL(value);
    const projectId = url.pathname.split("/").filter(Boolean).at(-1) ?? "";
    if (url.protocol !== "https:" || !url.username || !projectId) return null;
    return { origin: url.origin, publicKey: decodeURIComponent(url.username), projectId };
  } catch {
    return null;
  }
}
export async function persistDiagnosticEvent(base44: any, input: Record<string, unknown>) {
  try {
    const record = toDiagnosticRecord(input);
    await base44.asServiceRole.entities.DiagnosticEvent.create(record);
    return true;
  } catch {
    return false;
  }
}

export function logStructuredEvent(input: Record<string, unknown>) {
  console.log(JSON.stringify({
    timestamp: new Date().toISOString(),
    ...serializeLogEvent(input),
  }));
}

export function redactLogValue(value: string) {
  return value
    .replace(/Bearer\s+[A-Za-z0-9._~-]+/gi, REDACTED)
    .replace(/https?:\/\/[^\s]+/gi, REDACTED)
    .replace(/(?:token|secret|password|api[_-]?key|pairing[_-]?token)\s*[:=]\s*[^\s,;]+/gi, REDACTED)
    .replace(/\b(?:mp|sk|pk|rk|tok|pair)_[A-Za-z0-9_-]{8,}/gi, REDACTED)
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, REDACTED);
}
