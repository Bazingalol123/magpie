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
  if (attempt.status !== "claimed" || !validDate(attempt.lease_expires_at)) return false;
  return new Date(attempt.lease_expires_at!).getTime() <= nowMs;
}

type LeaseClaimInput = {
  workerId: string;
  leaseId: string;
  nowMs: number;
  leaseMs: number;
};

export function buildLeaseClaim(attempt: RefreshAttempt, input: LeaseClaimInput) {
  if (!isRefreshAttemptClaimable(attempt, input.nowMs)) {
    throw new Error("Refresh attempt is not claimable");
  }
  if (!input.workerId.trim() || !input.leaseId.trim()) {
    throw new Error("Lease worker and lease ID are required");
  }
  if (!Number.isFinite(input.leaseMs) || input.leaseMs < 1_000 || input.leaseMs > 15 * 60_000) {
    throw new Error("Lease duration is outside the supported range");
  }
  const startedAt = new Date(input.nowMs).toISOString();
  return {
    status: "claimed" as const,
    claimed_by: input.workerId.slice(0, 120),
    lease_id: input.leaseId.slice(0, 160),
    lease_expires_at: new Date(input.nowMs + input.leaseMs).toISOString(),
    started_at: startedAt,
  };
}
