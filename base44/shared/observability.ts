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
};

export function createDiagnosticContext(request: Request | undefined, functionName: string, operation: string, startedAtMs = Date.now()): DiagnosticContext {
  return {
    request_id: requestIdFrom(request),
    function_name: functionName.slice(0, 80),
    operation: operation.slice(0, 80),
    started_at_ms: startedAtMs,
    stage: "request",
  };
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
  const occurredAt = now.toISOString();
  return {
    ...event,
    environment: typeof input.environment === "string" ? redactLogValue(input.environment).slice(0, 32) : "production",
    occurred_at: occurredAt,
    expires_at: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1_000).toISOString(),
  };
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
    .replace(/mp_[A-Za-z0-9_-]{20,}/g, REDACTED)
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, REDACTED);
}
