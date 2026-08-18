import { createClientFromRequest } from "npm:@base44/sdk";
import { requireExtensionPrincipal } from "../../shared/auth.ts";
import { canonicalizeUrl, screenshotFile, validateCapture } from "../../shared/clip.ts";
import { getOrNull } from "../../shared/service-entities.ts";
import { corsHeaders, errorResponse, HttpError, json, readJson, requirePost } from "../../shared/http.ts";
import {
  captureSentryEvent,
  classifyError,
  createDiagnosticContext,
  diagnosticDurationMs,
  logStructuredEvent,
  persistDiagnosticEvent,
} from "../../shared/observability.ts";
import { markRoutingFailed, processStoredClip } from "../../shared/routing-persistence.ts";

Deno.serve(async (req) => {
  const diagnostic = createDiagnosticContext(req, "ingest-clip", "capture");
  try {
    if (requirePost(req)) return new Response(null, { status: 204, headers: corsHeaders });

    diagnostic.stage = "auth";
    const base44 = createClientFromRequest(req);
    const { ownerId } = await requireExtensionPrincipal(base44, req);
    diagnostic.stage = "validate";
    const capture = validateCapture(await readJson(req));
    if (capture.mission_id) {
      const mission = await getOrNull(base44.asServiceRole.entities.Mission, capture.mission_id);
      if (!mission || mission.owner_id !== ownerId || mission.status !== "active") {
        return errorResponse(new HttpError(409, "The selected Project is unavailable"), req, diagnostic);
      }
    }
    diagnostic.stage = "deduplication";
    if (capture.idempotency_key) {
      const existing = await base44.asServiceRole.entities.Clip.filter({
        owner_id: ownerId,
        idempotency_key: capture.idempotency_key,
      }, "-created_date", 1);
      if (existing[0]) {
        diagnostic.stage = "routing";
        const result = await processStoredClip(base44, existing[0].id);
        recordCaptureSuccess(diagnostic, 202);
        return json({
          accepted: true,
          duplicate: true,
          capture_status: "duplicate",
          clip_id: existing[0].id,
          routing_status: result.clip.routing_status,
          routing_reason_code: result.clip.routing_reason_code,
        }, 202, diagnostic.request_id);
      }
    }
    const canonicalUrl = canonicalizeUrl(capture.source_url);
    const contentHash = await sha256(
      `${capture.capture_mode}\n${canonicalUrl}\n${capture.context_url ?? ""}\n${capture.raw_text.replace(/\s+/g, " ").trim()}`,
    );
    const identicalClips = await base44.asServiceRole.entities.Clip.filter({
      owner_id: ownerId,
      content_hash: contentHash,
    }, "-created_date", 1);
    if (identicalClips[0] && identicalClips[0].routing_status !== "failed") {
      recordCaptureSuccess(diagnostic, 202);
      return json({
        accepted: true,
        duplicate: true,
        capture_status: "duplicate",
        clip_id: identicalClips[0].id,
        routing_status: identicalClips[0].routing_status,
        routing_reason_code: identicalClips[0].routing_reason_code,
      }, 202, diagnostic.request_id);
    }
    const { screenshot_data_url: screenshotDataUrl, ...clipData } = capture;
    const screenshot = screenshotFile(screenshotDataUrl);
    let screenshotUrl = clipData.screenshot_id;
    if (screenshot) {
      try {
        const uploaded = await base44.asServiceRole.integrations.Core.UploadFile({ file: screenshot });
        screenshotUrl = uploaded.file_url;
      } catch (uploadError) {
        console.warn("Screenshot upload failed; preserving the clip without an image", uploadError);
      }
    }
    diagnostic.stage = "storage";
    const clip = await base44.asServiceRole.entities.Clip.create({
      owner_id: ownerId,
      ...clipData,
      canonical_url: canonicalUrl,
      screenshot_id: screenshotUrl,
      content_hash: contentHash,
      attempt_count: 0,
      status: "queued",
      routing_status: "pending",
    });

    try {
      diagnostic.stage = "routing";
      const result = await processStoredClip(base44, clip.id);
      recordCaptureSuccess(diagnostic, 202);
      return json({
        accepted: true,
        capture_status: "new",
        clip_id: clip.id,
        routing_status: result.clip.routing_status,
        routing_reason_code: result.clip.routing_reason_code,
      }, 202, diagnostic.request_id);
    } catch (routingError) {
      console.error("Clip organization failed", routingError);
      const classified = classifyError(routingError);
      await recordCaptureError(base44, diagnostic, classified);
      let failed;
      try {
        failed = await markRoutingFailed(base44, clip.id, routingError);
      } catch (markError) {
        console.error("Clip failure state could not be persisted", markError);
      }
      return json({
        accepted: true,
        clip_id: clip.id,
        routing_status: failed?.clip?.routing_status ?? "failed",
        routing_reason_code: failed?.clip?.routing_reason_code ?? "unexpected_failure",
      }, 202, diagnostic.request_id);
    }
  } catch (error) {
    return errorResponse(error, req, diagnostic);
  }
});

function recordCaptureSuccess(diagnostic: ReturnType<typeof createDiagnosticContext>, status: number) {
  logStructuredEvent({
    event: "capture.request.finished",
    ...diagnostic,
    status,
    duration_ms: diagnosticDurationMs(diagnostic),
    error_code: "NONE",
    outcome: "success",
    environment: "production",
  });
}

async function recordCaptureError(base44: any, diagnostic: ReturnType<typeof createDiagnosticContext>, classified: ReturnType<typeof classifyError>) {
  const event = {
    event: "capture.request.error",
    ...diagnostic,
    status: classified.status ?? 500,
    duration_ms: diagnosticDurationMs(diagnostic),
    error_code: classified.error_code,
    message: classified.message,
    outcome: "error",
    environment: "production",
  };
  logStructuredEvent(event);
  await captureSentryEvent(event);
  await persistDiagnosticEvent(base44, event);
}

async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}
