import { enrichRecord, shouldAutoPauseWatch } from "./enrichment-v2.ts";
import { recordUsageEvent } from "./usage.ts";

// Kept short relative to the shortest supported frequency ("hourly"): long
// enough to cover one batch's sequential processing time, short enough that
// a crashed run doesn't strand a watch untended for anywhere near its real
// interval before the next sweep reconsiders it.
export const SWEEP_CLAIM_WINDOW_MS = 15 * 60 * 1_000;

export function calculateNextCheck(frequency: string, failureCount: number, from = new Date()) {
  const baseHours = frequency === "hourly" ? 1 : frequency === "weekly" ? 24 * 7 : 24;
  const multiplier = failureCount ? 2 ** Math.min(failureCount, 4) : 1;
  return new Date(from.getTime() + baseHours * multiplier * 60 * 60 * 1_000).toISOString();
}

// sweep-watches is invoked on a fixed external schedule (no in-repo cron),
// so two invocations can overlap (a slow run still in flight when the next
// tick fires). Selecting due watches and only rescheduling them once the
// real check finishes leaves a window where a second invocation reads the
// same rows as still due and double-processes them. Claiming every selected
// watch immediately -- before any of the (potentially slow) real checks run
// -- shrinks that window from "however long the whole batch takes" to
// "however long this claim loop takes", which is the only concurrency
// safeguard this function has (see docs/DECISIONS.md).
export async function claimWatches(service: any, watches: any[], now = Date.now()) {
  const claimedUntil = new Date(now + SWEEP_CLAIM_WINDOW_MS).toISOString();
  for (const watch of watches) {
    await service.WatchRule.update(watch.id, { next_check_at: claimedUntil });
  }
  return claimedUntil;
}

export async function selectDueWatches(service: any, watchLimit: number, now = Date.now()) {
  const candidates = await service.WatchRule.filter({ active: true }, "next_check_at", Math.min(watchLimit * 3, 100));
  return candidates
    .filter((watch: any) => !watch.next_check_at || new Date(watch.next_check_at).getTime() <= now)
    .slice(0, watchLimit);
}

export async function processWatch(base44: any, service: any, watch: any, fetchImpl: typeof fetch = fetch) {
  const strategy = watch.acquisition_strategy ?? "direct_http";

  if (strategy === "zyte") {
    const blocked = {
      status: "blocked",
      changeCount: 0,
      checkedAt: new Date().toISOString(),
      retryable: false,
      errorCode: "ZYTE_SCHEDULED_QUOTA_NOT_ENABLED",
    };
    const failureCount = Number(watch.failure_count || 0) + 1;
    const autoPaused = shouldAutoPauseWatch(blocked.status, blocked.retryable, failureCount);
    await service.WatchRule.update(watch.id, {
      last_checked_at: blocked.checkedAt,
      last_status: blocked.status,
      last_error_code: autoPaused ? "AUTO_PAUSED_BLOCKED" : blocked.errorCode,
      failure_count: failureCount,
      next_check_at: calculateNextCheck(watch.frequency, failureCount),
      ...(autoPaused ? { active: false } : {}),
    });
    return { watch_id: watch.id, strategy, outcome: blocked.status, blocked: true, auto_paused: autoPaused, error_code: blocked.errorCode };
  }

  if (strategy === "owner_browser") {
    const blocked = {
      status: "waiting_for_owner_browser",
      changeCount: 0,
      checkedAt: new Date().toISOString(),
      retryable: false,
      errorCode: "OWNER_BROWSER_REQUIRED",
    };
    await service.WatchRule.update(watch.id, {
      last_checked_at: blocked.checkedAt,
      last_status: blocked.status,
      last_error_code: blocked.errorCode,
      next_check_at: calculateNextCheck(watch.frequency, 0),
    });
    return { watch_id: watch.id, strategy, outcome: blocked.status, blocked: true, error_code: blocked.errorCode };
  }

  try {
    const result = await enrichRecord(base44, watch.record_id, fetchImpl);
    const successful = result.status === "changed" || result.status === "unchanged";
    const failureCount = successful ? 0 : Number(watch.failure_count || 0) + 1;
    const autoPaused = shouldAutoPauseWatch(result.status, result.retryable, failureCount);
    const nextCheckAt = calculateNextCheck(watch.frequency, result.retryable ? failureCount : 0);
    await service.WatchRule.update(watch.id, {
      last_checked_at: result.checkedAt,
      last_status: result.status,
      last_error_code: autoPaused ? "AUTO_PAUSED_BLOCKED" : result.errorCode,
      failure_count: failureCount,
      next_check_at: nextCheckAt,
      ...(autoPaused ? { active: false } : {}),
    });
    // A real direct-source fetch was attempted here, unlike the zyte/owner_browser
    // stubs above which never touch a source and so incur no cost to record.
    await recordUsageEvent(base44, {
      owner_id: watch.owner_id,
      operation: "watch_check",
      provider: "base44",
      outcome: successful ? "success" : "error",
      idempotency_key: `watch:${watch.id}:${result.checkedAt}`,
    });
    return {
      watch_id: watch.id,
      outcome: result.status,
      changes: result.changeCount,
      retryable: result.retryable,
      auto_paused: autoPaused,
      next_check_at: nextCheckAt,
    };
  } catch (error) {
    console.error(`Watch ${watch.id} failed`, error);
    const failureCount = Number(watch.failure_count || 0) + 1;
    const nextCheckAt = calculateNextCheck(watch.frequency, failureCount);
    await service.WatchRule.update(watch.id, {
      last_checked_at: new Date().toISOString(),
      last_status: "failed",
      last_error_code: "UNEXPECTED_CHECK_FAILURE",
      failure_count: failureCount,
      next_check_at: nextCheckAt,
    });
    return { watch_id: watch.id, outcome: "failed", retryable: true, next_check_at: nextCheckAt };
  }
}

export async function sweepDueWatches(base44: any, watchLimit: number, fetchImpl: typeof fetch = fetch) {
  const service = base44.asServiceRole.entities;
  const watches = await selectDueWatches(service, watchLimit);
  if (!watches.length) return { processed: 0, results: [] };

  await claimWatches(service, watches);

  const results = [];
  for (const watch of watches) {
    results.push(await processWatch(base44, service, watch, fetchImpl));
  }
  return { processed: results.length, results };
}
