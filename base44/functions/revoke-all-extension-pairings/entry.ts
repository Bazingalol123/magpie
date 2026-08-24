import { createClientFromRequest } from "npm:@base44/sdk";
import { requireUser } from "../../shared/auth.ts";
import { corsHeaders, errorResponse, json, requirePost } from "../../shared/http.ts";
import { revokeAllOwnedPairings } from "../../shared/pairing-management.ts";

Deno.serve(async (req) => {
  try {
    if (requirePost(req)) return new Response(null, { status: 204, headers: corsHeaders });

    const base44 = createClientFromRequest(req);
    const user = await requireUser(base44);
    const result = await revokeAllOwnedPairings(base44.asServiceRole.entities.ExtensionInstall, user.id);
    return json(result);
  } catch (error) {
    return errorResponse(error, req);
  }
});
