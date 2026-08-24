import { createClientFromRequest } from "npm:@base44/sdk";
import { requireUser } from "../../shared/auth.ts";
import { corsHeaders, errorResponse, json, readJson, requirePost } from "../../shared/http.ts";
import { correctRecordField, parseRecordFieldCorrection } from "../../shared/record-field-correction.ts";

Deno.serve(async (req) => {
  try {
    if (requirePost(req)) return new Response(null, { status: 204, headers: corsHeaders });
    const base44 = createClientFromRequest(req);
    const user = await requireUser(base44);
    const command = parseRecordFieldCorrection(await readJson(req));
    const result = await correctRecordField(base44.asServiceRole.entities, user.id, command);
    return json({
      changed: result.changed,
      record: result.record,
      enrichment: result.enrichment,
    });
  } catch (error) {
    return errorResponse(error, req);
  }
});
