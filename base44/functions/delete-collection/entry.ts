import { createClientFromRequest } from "npm:@base44/sdk";
import { requireUser } from "../../shared/auth.ts";
import { corsHeaders, errorResponse, HttpError, json, readJson, requirePost } from "../../shared/http.ts";
import { removeCollection } from "../../shared/collection-removal.ts";

Deno.serve(async (req) => {
  try {
    if (requirePost(req)) return new Response(null, { status: 204, headers: corsHeaders });

    const base44 = createClientFromRequest(req);
    const user = await requireUser(base44);
    const { collection_id: collectionId } = await readJson(req);
    if (typeof collectionId !== "string" || !/^[A-Za-z0-9_-]{1,160}$/.test(collectionId)) {
      throw new HttpError(400, "collection_id is required");
    }

    const service = base44.asServiceRole.entities;
    const result = await removeCollection(service, user.id, collectionId);
    return json({ deleted: result.deleted });
  } catch (error) {
    return errorResponse(error);
  }
});
