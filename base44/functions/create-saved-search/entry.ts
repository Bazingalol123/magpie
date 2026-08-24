import { createClientFromRequest } from "npm:@base44/sdk";
import { requireUser } from "../../shared/auth.ts";
import { corsHeaders, errorResponse, HttpError, json, readJson, requirePost } from "../../shared/http.ts";
import { getOrNull } from "../../shared/service-entities.ts";

Deno.serve(async (req) => {
  try {
    if (requirePost(req)) return new Response(null, { status: 204, headers: corsHeaders });
    const base44 = createClientFromRequest(req);
    const user = await requireUser(base44);
    const input = await readJson(req);
    const query = boundedText(input.query, 240);
    const name = boundedText(input.name, 80);
    const missionId = boundedText(input.mission_id, 160);
    if (!query) throw new HttpError(400, "A search query is required");
    if (!name) throw new HttpError(400, "A Collection name is required");

    const service = base44.asServiceRole.entities;
    if (missionId) {
      const mission = await getOrNull(service.Mission, missionId);
      if (!mission) throw new HttpError(404, "Project was not found");
      if (mission.owner_id !== user.id) throw new HttpError(403, "This Project belongs to another workspace");
    }
    const matches = await service.Collection.filter({
      owner_id: user.id,
      collection_type: "saved_search",
      saved_query: query,
    }, "-created_date", 50);
    const existing = matches.find((item: any) => (item.mission_id || "") === missionId);
    if (existing) return json({ collection: existing, duplicate: true });

    const scopeKey = missionId || "library";
    const normalizedName = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "search";
    const queryKey = stableKey(query);
    const collection = await service.Collection.create({
      owner_id: user.id,
      name,
      description: `Live search: ${query}`.slice(0, 240),
      ...(missionId ? { mission_id: missionId } : {}),
      normalized_key: `${user.id}:${scopeKey}:saved-search:${normalizedName}:${queryKey}`.slice(0, 180),
      schema_json: "[]",
      schema_version: 1,
      collection_type: "saved_search",
      saved_query: query,
      saved_query_json: JSON.stringify({ version: 1, query }),
      status: "active",
      origin: "user",
      is_shared_readonly: false,
    });
    return json({ collection, duplicate: false }, 201);
  } catch (error) {
    return errorResponse(error, req);
  }
});

function boundedText(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function stableKey(value: string) {
  let hash = 2166136261;
  for (const character of value.toLowerCase()) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}
