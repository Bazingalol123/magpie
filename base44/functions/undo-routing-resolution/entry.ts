import { createClientFromRequest } from "npm:@base44/sdk";
import { requireUser } from "../../shared/auth.ts";
import { corsHeaders, errorResponse, json, readJson, requirePost } from "../../shared/http.ts";
import { parseUndoRoutingCommand, undoRoutingResolution } from "../../shared/routing-undo.ts";

Deno.serve(async (req) => {
  try {
    if (requirePost(req)) return new Response(null, { status: 204, headers: corsHeaders });
    const base44 = createClientFromRequest(req);
    const user = await requireUser(base44);
    const command = parseUndoRoutingCommand(await readJson(req));
    const result = await undoRoutingResolution(base44.asServiceRole.entities, user.id, command.clipId);
    return json(result);
  } catch (error) {
    return errorResponse(error, req);
  }
});
