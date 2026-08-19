export type AcquisitionStrategy = "direct_http" | "zyte" | "owner_browser";

export type AcquisitionResult = {
  status: "success" | "blocked" | "rate_limited" | "not_found" | "auth_required" | "unreachable" | "invalid_content";
  strategy: AcquisitionStrategy;
  retryable: boolean;
  errorCode?: string;
  providerRequestId?: string;
  evidenceHash?: string;
};

export type RefreshAttemptKeyInput = {
  watchId: string;
  recordId: string;
  scheduledAt: string;
  strategy: AcquisitionStrategy;
};

function bounded(value: string, max = 120) {
  return value.replace(/[^A-Za-z0-9_.:-]/g, "_").slice(0, max);
}

function hash(value: string) {
  let result = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    result ^= value.charCodeAt(index);
    result = Math.imul(result, 16777619);
  }
  return (result >>> 0).toString(16).padStart(8, "0");
}

export function buildRefreshAttemptKey(input: RefreshAttemptKeyInput) {
  const readable = [
    bounded(input.watchId, 48),
    bounded(input.recordId, 48),
    bounded(input.scheduledAt, 48),
    input.strategy,
  ].join("_");
  return `refresh_${hash(readable)}_${readable}`.slice(0, 240);
}

type RefreshDiagnosticInput = {
  event: string;
  requestId: string;
  attemptId: string;
  watchId: string;
  recordId: string;
  strategy: AcquisitionStrategy;
  result: AcquisitionResult;
  durationMs?: number;
  sourceUrl?: string;
  ownerId?: string;
};

export function buildRefreshDiagnostic(input: RefreshDiagnosticInput) {
  const event: Record<string, unknown> = {
    event: bounded(input.event, 80),
    request_id: bounded(input.requestId, 100),
    attempt_id: bounded(input.attemptId, 120),
    watch_id: bounded(input.watchId, 120),
    record_id: bounded(input.recordId, 120),
    strategy: input.strategy,
    outcome: input.result.status,
    retryable: input.result.retryable,
  };
  if (input.durationMs !== undefined && Number.isFinite(input.durationMs)) {
    event.duration_ms = Math.min(Math.max(Math.round(input.durationMs), 0), 600_000);
  }
  if (input.result.errorCode) event.error_code = bounded(input.result.errorCode, 80);
  if (input.result.providerRequestId) event.provider_request_id = bounded(input.result.providerRequestId, 160);
  if (input.result.evidenceHash) event.evidence_hash = bounded(input.result.evidenceHash, 160);
  return event;
}
