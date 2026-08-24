import { createClientFromRequest } from "npm:@base44/sdk";
import { requireUser } from "../../shared/auth.ts";
import { corsHeaders, errorResponse, json, readJson, requirePost } from "../../shared/http.ts";
import { parseInstallationId, revokeOwnedPairing } from "../../shared/pairing-management.ts";

Deno.serve(async (req) => {
  try {
    if (requirePost(req)) return new Response(null, { status: 204, headers: corsHeaders });

    const base44 = createClientFromRequest(req);
    const user = await requireUser(base44);
    const input = await readJson(req);
    const installationId = parseInstallationId(input.installation_id);
    const result = await revokeOwnedPairing(
      base44.asServiceRole.entities.ExtensionInstall,
      user.id,
      installationId,
    );
    return json(result);
  } catch (error) {
    return errorResponse(error, req);
  }
});
