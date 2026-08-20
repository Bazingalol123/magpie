import { createClientFromRequest } from "npm:@base44/sdk";
import { canAccessOwner, requireUser } from "../../shared/auth.ts";
import { enrichRecordWithZyte, enrichRecord } from "../../shared/enrichment-v2.ts";
import { buildRefreshDiagnostic } from "../../shared/refresh-contracts.ts";
import {
  captureSentryTransaction,
  createDiagnosticContext,
  logStructuredEvent,
  requestIdFrom,
  setDiagnosticStage,
} from "../../shared/observability.ts";
import { corsHeaders, errorResponse, HttpError, json, readJson, requirePost } from "../../shared/http.ts";
import { getOrNull } from "../../shared/service-entities.ts";

Deno.serve(async (req) => {
  try {
    if (requirePost(req)) return new Response(null, { status: 204, headers: corsHeaders });

    const diagnostic = createDiagnosticContext(req, "enrich-record", "refresh");
    const base44 = createClientFromRequest(req);
    const caller = await requireUser(base44);
    const input = await readJson(req);
    if (!input || typeof input !== "object" || Array.isArray(input)) {
      throw new HttpError(400, "Request body must be an object");
    }
    const recordId = input.record_id;
    if (typeof recordId !== "string" || !recordId.trim()) throw new HttpError(400, "record_id is required");
    const strategy = input.acquisition_strategy ?? "direct_http";
    if (strategy !== "direct_http" && strategy !== "zyte" && strategy !== "owner_browser") {
      throw new HttpError(400, "acquisition_strategy must be direct_http, zyte, or owner_browser");
    }
    if (strategy === "owner_browser") {
      throw new HttpError(409, "Owner Browser refresh requires the paired extension");
    }

    const record = await getOrNull(base44.asServiceRole.entities.Record, recordId);
    if (!record) throw new HttpError(404, "Record not found");
    if (!canAccessOwner(caller, record.owner_id)) throw new HttpError(403, "Record belongs to another owner");

    if (strategy === "zyte") {
      if (Deno.env.get("ZYTE_POC_ENABLED") !== "true") {
        throw new HttpError(404, "Cloud refresh POC is not enabled");
      }
      const allowedOwnerId = Deno.env.get("ZYTE_POC_OWNER_ID") ?? "";
      if (!allowedOwnerId || caller.id !== allowedOwnerId) {
        throw new HttpError(403, "Cloud refresh is restricted to the canary owner");
      }
      const apiKey = Deno.env.get("ZYTE_API_KEY") ?? "";
      if (!apiKey) throw new HttpError(503, "Cloud refresh is not configured");
      setDiagnosticStage(diagnostic, "zyte");
      const result = await enrichRecordWithZyte(base44, record, apiKey);
      const diagnosticStatus = result.status === "changed" || result.status === "unchanged"
        ? "success"
        : result.status === "blocked"
        ? "blocked"
        : result.status === "rate_limited"
        ? "rate_limited"
        : result.status === "not_found"
        ? "not_found"
        : result.status === "unreachable"
        ? "unreachable"
        : "invalid_content";
      logStructuredEvent(buildRefreshDiagnostic({
        event: "refresh.provider.finished",
        requestId: requestIdFrom(req),
        attemptId: `manual:${record.id}`,
        watchId: "manual",
        recordId: record.id,
        strategy: "zyte",
        result: {
          status: diagnosticStatus,
          strategy: "zyte",
          retryable: result.retryable,
          errorCode: result.errorCode || undefined,
          providerRequestId: result.providerRequestId,
          evidenceHash: result.evidenceHash,
        },
        durationMs: result.durationMs,
      }));
      await captureSentryTransaction({
        event: "refresh.provider.finished",
        request_id: requestIdFrom(req),
        strategy: "zyte",
        outcome: diagnosticStatus === "success" ? "success" : "error",
        error_code: result.errorCode || "NONE",
        status: diagnosticStatus === "success" ? 200 : 502,
        duration_ms: result.durationMs,
        message: result.message,
        environment: "production",
      }, diagnostic);
      return json({
        outcome: result.status,
        checked_at: result.checkedAt,
        change_count: result.changeCount,
        retryable: result.retryable,
        error_code: result.errorCode,
        message: result.message,
        provider: "zyte",
        provider_request_id: result.providerRequestId,
        evidence_hash: result.evidenceHash,
        confidence: result.confidence,
        duration_ms: result.durationMs,
      });
    }

    const result = await enrichRecord(base44, record.id);
    return json({
      outcome: result.status,
      checked_at: result.checkedAt,
      change_count: result.changeCount,
      retryable: result.retryable,
      error_code: result.errorCode,
      message: result.message,
      provider: "direct_http",
    });
  } catch (error) {
    return errorResponse(error, req);
  }
});
