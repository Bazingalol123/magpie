import { createClientFromRequest } from "npm:@base44/sdk";
import { requireUser } from "../../shared/auth.ts";
import { corsHeaders, errorResponse, HttpError, json, readJson, requirePost } from "../../shared/http.ts";
import { removeRecord } from "../../shared/record-removal.ts";

Deno.serve(async (req) => {
  try {
    if (requirePost(req)) return new Response(null, { status: 204, headers: corsHeaders });

    const base44 = createClientFromRequest(req);
    const user = await requireUser(base44);
    const { record_id: recordId } = await readJson(req);
    if (typeof recordId !== "string" || !/^[A-Za-z0-9_-]{1,160}$/.test(recordId)) {
      throw new HttpError(400, "record_id is required");
    }

    const service = base44.asServiceRole.entities;
    const result = await removeRecord(service, user.id, recordId);
    return json({ deleted: result.deleted });
  } catch (error) {
    return errorResponse(error);
  }
});
