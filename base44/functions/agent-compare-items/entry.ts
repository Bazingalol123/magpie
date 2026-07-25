import { createClientFromRequest } from "npm:@base44/sdk";
import { requireUser } from "../../shared/auth.ts";
import { buildComparison, optionalId, requireOwned } from "../../shared/agent-tools.ts";
import { corsHeaders, errorResponse, HttpError, json, readJson, requirePost } from "../../shared/http.ts";
import { getOrNull } from "../../shared/service-entities.ts";

Deno.serve(async (req) => {
  try {
    if (requirePost(req)) return new Response(null, { status: 204, headers: corsHeaders });

    const base44 = createClientFromRequest(req);
    const user = await requireUser(base44);
    const input = await readJson(req);
    if (!Array.isArray(input.record_ids) || input.record_ids.length < 2 || input.record_ids.length > 12) {
      throw new HttpError(400, "record_ids must contain between 2 and 12 Item IDs");
    }
    const recordIds = input.record_ids.map((value: unknown) => optionalId(value, "record_ids"));
    if (recordIds.some((id: string | undefined) => !id)) {
      throw new HttpError(400, "record_ids contains an invalid ID");
    }
    if (new Set(recordIds).size !== recordIds.length) {
      throw new HttpError(400, "record_ids must be unique");
    }

    const service = base44.asServiceRole.entities;
    const records = await Promise.all(recordIds.map(async (id: string | undefined) =>
      requireOwned(await getOrNull(service.Record, id!), user.id, "Item")
    ));
    const collectionIds = [...new Set(records.map((record: any) => record.collection_id))];
    const collections = await Promise.all(collectionIds.map(async (id: string) =>
      requireOwned(await getOrNull(service.Collection, id), user.id, "Collection")
    ));

    return json(buildComparison(records, collections, user.id));
  } catch (error) {
    return errorResponse(error);
  }
});
