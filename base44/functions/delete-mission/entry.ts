import { createClientFromRequest } from "npm:@base44/sdk";
import { requireUser } from "../../shared/auth.ts";
import { corsHeaders, errorResponse, HttpError, json, readJson, requirePost } from "../../shared/http.ts";
import { removeMission } from "../../shared/mission-removal.ts";

Deno.serve(async (req) => {
  try {
    if (requirePost(req)) return new Response(null, { status: 204, headers: corsHeaders });

    const base44 = createClientFromRequest(req);
    const user = await requireUser(base44);
    const { mission_id: missionId } = await readJson(req);
    if (typeof missionId !== "string" || !/^[A-Za-z0-9_-]{1,160}$/.test(missionId)) {
      throw new HttpError(400, "mission_id is required");
    }

    const service = base44.asServiceRole.entities;
    const result = await removeMission(service, user.id, missionId);
    return json({ deleted: result.deleted });
  } catch (error) {
    return errorResponse(error);
  }
});
