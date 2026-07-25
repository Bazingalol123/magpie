import { createClientFromRequest } from "npm:@base44/sdk";
import { canAccessOwner, requireUser } from "../../shared/auth.ts";
import { enrichRecord } from "../../shared/enrichment-v2.ts";
import { corsHeaders, errorResponse, HttpError, json, readJson, requirePost } from "../../shared/http.ts";
import { getOrNull } from "../../shared/service-entities.ts";

Deno.serve(async (req) => {
  try {
    if (requirePost(req)) return new Response(null, { status: 204, headers: corsHeaders });

    const base44 = createClientFromRequest(req);
    const caller = await requireUser(base44);
    const { record_id: recordId } = await readJson(req);
    if (typeof recordId !== "string") throw new HttpError(400, "record_id is required");

    const record = await getOrNull(base44.asServiceRole.entities.Record, recordId);
    if (!record) throw new HttpError(404, "Record not found");
    if (!canAccessOwner(caller, record.owner_id)) throw new HttpError(403, "Record belongs to another owner");

    const result = await enrichRecord(base44, recordId);
    return json({
      outcome: result.status,
      checked_at: result.checkedAt,
      change_count: result.changeCount,
      retryable: result.retryable,
      error_code: result.errorCode,
      message: result.message,
    });
  } catch (error) {
    return errorResponse(error);
  }
});
