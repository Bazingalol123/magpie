import { createClientFromRequest } from "npm:@base44/sdk";
import { requireUser } from "../../shared/auth.ts";
import { corsHeaders, errorResponse, json, readJson, requirePost } from "../../shared/http.ts";
import { parseResolveRoutingCommand, resolveRouting } from "../../shared/routing-resolution.ts";

Deno.serve(async (req) => {
  try {
    if (requirePost(req)) return new Response(null, { status: 204, headers: corsHeaders });

    const base44 = createClientFromRequest(req);
    const user = await requireUser(base44);
    const command = parseResolveRoutingCommand(await readJson(req));
    const service = base44.asServiceRole.entities;
    const result = await resolveRouting(service, user.id, command);

    if (result.dismissed) {
      return json({ dismissed: true, clip_id: result.clip_id });
    }
    return json({
      outcome: result.decision.outcome,
      routing_status: result.clip.routing_status,
      collection_id: result.collection?.id,
      record_id: result.record?.id,
      routing_decision_id: result.decision.id,
      duplicate: result.duplicate,
    });
  } catch (error) {
    return errorResponse(error, req);
  }
});
