import { createClientFromRequest } from "npm:@base44/sdk";
import { canAccessOwner, requireUser } from "../../shared/auth.ts";
import { corsHeaders, errorResponse, HttpError, json, readJson, requirePost } from "../../shared/http.ts";
import { processStoredClip } from "../../shared/routing-persistence.ts";
import { getOrNull } from "../../shared/service-entities.ts";

Deno.serve(async (req) => {
  try {
    if (requirePost(req)) return new Response(null, { status: 204, headers: corsHeaders });

    const base44 = createClientFromRequest(req);
    const caller = await requireUser(base44);
    const { clip_id: clipId } = await readJson(req);
    if (typeof clipId !== "string") throw new HttpError(400, "clip_id is required");

    const clip = await getOrNull(base44.asServiceRole.entities.Clip, clipId);
    if (!clip) throw new HttpError(404, "Clip not found");
    if (!canAccessOwner(caller, clip.owner_id)) throw new HttpError(403, "Clip belongs to another owner");

    const result = await processStoredClip(base44, clip.id);
    return json({
      outcome: result.decision.outcome,
      routing_status: result.clip.routing_status,
      collection_id: result.collection?.id,
      record_id: result.record?.id,
      routing_decision_id: result.decision.id,
      duplicate: result.duplicate,
    });
  } catch (error) {
    return errorResponse(error);
  }
});
