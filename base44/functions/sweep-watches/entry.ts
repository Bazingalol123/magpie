import { createClientFromRequest } from "npm:@base44/sdk";
import { enrichRecord, shouldAutoPauseWatch } from "../../shared/enrichment-v2.ts";
import { corsHeaders, errorResponse, json, readJson, requirePost } from "../../shared/http.ts";

Deno.serve(async (req) => {
  try {
    if (requirePost(req)) return new Response(null, { status: 204, headers: corsHeaders });

    const base44 = createClientFromRequest(req);
    const caller = await base44.auth.me();
    if (!caller || caller.role !== "admin") return json({ error: "Admin authorization is required" }, 403);

    const { limit } = await readJson(req);
    const watchLimit = Math.min(Math.max(Number(limit) || 20, 1), 50);
    const watchCandidates = await base44.asServiceRole.entities.WatchRule.filter({ active: true }, "next_check_at", Math.min(watchLimit * 3, 100));
    const now = Date.now();
    const watches = watchCandidates
      .filter((watch: any) => !watch.next_check_at || new Date(watch.next_check_at).getTime() <= now)
      .slice(0, watchLimit);
    const results = [];

    for (const watch of watches) {
      try {
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
        await base44.asServiceRole.entities.WatchRule.update(watch.id, {
          last_checked_at: blocked.checkedAt,
          last_status: blocked.status,
          last_error_code: autoPaused ? "AUTO_PAUSED_BLOCKED" : blocked.errorCode,
          failure_count: failureCount,
          next_check_at: calculateNextCheck(watch.frequency, failureCount),
          ...(autoPaused ? { active: false } : {}),
        });
        results.push({ watch_id: watch.id, strategy, outcome: blocked.status, blocked: true, auto_paused: autoPaused, error_code: blocked.errorCode });
        continue;
      }
      if (strategy === "owner_browser") {
        const blocked = {
          status: "waiting_for_owner_browser",
          changeCount: 0,
          checkedAt: new Date().toISOString(),
          retryable: false,
          errorCode: "OWNER_BROWSER_REQUIRED",
        };
        await base44.asServiceRole.entities.WatchRule.update(watch.id, {
          last_checked_at: blocked.checkedAt,
          last_status: blocked.status,
          last_error_code: blocked.errorCode,
          next_check_at: calculateNextCheck(watch.frequency, 0),
        });
        results.push({ watch_id: watch.id, strategy, outcome: blocked.status, blocked: true, error_code: blocked.errorCode });
        continue;
      }
      const result = await enrichRecord(base44, watch.record_id);
        const successful = result.status === "changed" || result.status === "unchanged";
        const failureCount = successful ? 0 : Number(watch.failure_count || 0) + 1;
        const autoPaused = shouldAutoPauseWatch(result.status, result.retryable, failureCount);
        const nextCheckAt = calculateNextCheck(watch.frequency, result.retryable ? failureCount : 0);
        await base44.asServiceRole.entities.WatchRule.update(watch.id, {
          last_checked_at: result.checkedAt,
          last_status: result.status,
          last_error_code: autoPaused ? "AUTO_PAUSED_BLOCKED" : result.errorCode,
          failure_count: failureCount,
          next_check_at: nextCheckAt,
          ...(autoPaused ? { active: false } : {}),
        });
        results.push({
          watch_id: watch.id,
          outcome: result.status,
          changes: result.changeCount,
          retryable: result.retryable,
          auto_paused: autoPaused,
          next_check_at: nextCheckAt,
        });
      } catch (error) {
        console.error(`Watch ${watch.id} failed`, error);
        const failureCount = Number(watch.failure_count || 0) + 1;
        const nextCheckAt = calculateNextCheck(watch.frequency, failureCount);
        await base44.asServiceRole.entities.WatchRule.update(watch.id, {
          last_checked_at: new Date().toISOString(),
          last_status: "failed",
          last_error_code: "UNEXPECTED_CHECK_FAILURE",
          failure_count: failureCount,
          next_check_at: nextCheckAt,
        });
        results.push({ watch_id: watch.id, outcome: "failed", retryable: true, next_check_at: nextCheckAt });
      }
    }

    return json({ processed: results.length, results });
  } catch (error) {
    return errorResponse(error, req);
  }
});

function calculateNextCheck(frequency: string, failureCount: number) {
  const baseHours = frequency === "hourly" ? 1 : frequency === "weekly" ? 24 * 7 : 24;
  const multiplier = failureCount ? 2 ** Math.min(failureCount, 4) : 1;
  return new Date(Date.now() + baseHours * multiplier * 60 * 60 * 1_000).toISOString();
}
