import { createClientFromRequest } from "npm:@base44/sdk";
import { requireUser } from "../../shared/auth.ts";
import {
  boundedText,
  optionalId,
  requireOwned,
  safeReasonCodes,
} from "../../shared/agent-tools.ts";
import { corsHeaders, errorResponse, HttpError, json, readJson, requirePost } from "../../shared/http.ts";
import { getOrNull } from "../../shared/service-entities.ts";

Deno.serve(async (req) => {
  try {
    if (requirePost(req)) return new Response(null, { status: 204, headers: corsHeaders });

    const base44 = createClientFromRequest(req);
    const user = await requireUser(base44);
    const input = await readJson(req);
    const clipId = optionalId(input.clip_id, "clip_id");
    if (!clipId) throw new HttpError(400, "clip_id is required");

    const service = base44.asServiceRole.entities;
    const clip = requireOwned(await getOrNull(service.Clip, clipId), user.id, "Capture");
    const decisions = await service.RoutingDecision.filter(
      { owner_id: user.id, clip_id: clipId },
      "-decided_at",
      1,
    );
    const decision = requireOwned(decisions[0] as any, user.id, "Routing decision") as any;
    const projectId = typeof decision.mission_id === "string" ? decision.mission_id : undefined;
    const project = projectId
      ? requireOwned(await getOrNull(service.Mission, projectId), user.id, "Project")
      : undefined;
    const collectionId = typeof decision.corrected_collection_id === "string"
      ? decision.corrected_collection_id
      : typeof decision.selected_collection_id === "string"
      ? decision.selected_collection_id
      : undefined;
    const collection = collectionId
      ? requireOwned(await getOrNull(service.Collection, collectionId), user.id, "Collection")
      : undefined;

    return json({
      capture: {
        id: clip.id,
        source_url: boundedText(clip.source_url, 2_000),
        capture_mode: boundedText(clip.capture_mode, 30),
        captured_at: clip.captured_at,
        routing_status: clip.routing_status,
      },
      decision: {
        outcome: decision.outcome,
        confidence: decision.confidence,
        reason_codes: safeReasonCodes(decision.reason_codes_json),
        project_assignment: decision.project_assignment,
        project_confidence: decision.project_confidence,
        project_reason_codes: safeReasonCodes(decision.project_reason_codes_json, true),
        corrected: Boolean(decision.corrected_collection_id),
        decided_at: decision.decided_at,
        corrected_at: decision.corrected_at,
      },
      project: project
        ? { id: project.id, title: boundedText(project.title, 120), status: project.status }
        : null,
      collection: collection
        ? { id: collection.id, name: boundedText(collection.name, 120), status: collection.status }
        : null,
      evidence: {
        capture_text_excerpt: boundedText(clip.raw_text, 1_000),
        screenshot_available: Boolean(clip.screenshot_id),
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
});
