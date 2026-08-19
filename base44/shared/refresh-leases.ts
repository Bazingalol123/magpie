import type { AcquisitionStrategy } from "./refresh-contracts.ts";

export type RefreshAttemptStatus =
  | "scheduled"
  | "queued"
  | "claimed"
  | "running"
  | "evidence_ready"
  | "compared"
  | "completed"
  | "blocked"
  | "rate_limited"
  | "auth_required"
  | "unreachable"
  | "invalid_content"
  | "waiting_for_owner_browser"
  | "expired";

export type RefreshAttempt = {
  id: string;
  owner_id: string;
  watch_id: string;
  record_id: string;
  strategy: AcquisitionStrategy;
  status: RefreshAttemptStatus;
  attempt_key: string;
  source_url: string;
  requested_at: string;
  claimed_by?: string;
  lease_id?: string;
  lease_expires_at?: string;
  started_at?: string;
};

function validDate(value: unknown) {
  return typeof value === "string" && Number.isFinite(new Date(value).getTime());
}

export function isRefreshAttemptClaimable(attempt: RefreshAttempt, nowMs = Date.now()) {
  if (attempt.strategy !== "owner_browser") return false;
  if (attempt.status === "queued") return true;
  if (!["claimed", "running"].includes(attempt.status) || !validDate(attempt.lease_expires_at)) return false;
  return new Date(attempt.lease_expires_at!).getTime() <= nowMs;
}
