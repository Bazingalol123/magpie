import { createClientFromRequest } from "npm:@base44/sdk";
import { createPairingToken, requireUser, sha256 } from "../../shared/auth.ts";
import { corsHeaders, errorResponse, json, readJson, requirePost } from "../../shared/http.ts";

// req.url resolves to the internal Cloudflare dispatcher host in production
// (base44-dispatcher-production.base44.workers.dev), not the public app domain,
// so the deployed origin must be hardcoded rather than derived from the request.
const APP_ORIGIN = "https://magpieorelse.base44.app";

Deno.serve(async (req) => {
  try {
    if (requirePost(req)) return new Response(null, { status: 204, headers: corsHeaders });

    const base44 = createClientFromRequest(req);
    const user = await requireUser(base44);
    const input = await readJson(req);
    const label = typeof input.label === "string" && input.label.trim()
      ? input.label.trim().slice(0, 80)
      : "Chrome extension";
    const token = createPairingToken();
    const pairing = await base44.asServiceRole.entities.ExtensionInstall.create({
      owner_id: user.id,
      label,
      token_hash: await sha256(token),
      active: true,
      created_at: new Date().toISOString(),
    });

    return json({
      extension_id: pairing.id,
      token,
      ingest_url: `${APP_ORIGIN}/functions/ingest-clip`,
    }, 201);
  } catch (error) {
    return errorResponse(error);
  }
});
