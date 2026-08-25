import { createClientFromRequest } from "npm:@base44/sdk";
import { sweepDueWatches } from "../../shared/watch-sweep.ts";
import { corsHeaders, errorResponse, json, readJson, requirePost } from "../../shared/http.ts";

Deno.serve(async (req) => {
  try {
    if (requirePost(req)) return new Response(null, { status: 204, headers: corsHeaders });

    const base44 = createClientFromRequest(req);
    const caller = await base44.auth.me();
    if (!caller || caller.role !== "admin") return json({ error: "Admin authorization is required" }, 403);

    const { limit } = await readJson(req);
    const watchLimit = Math.min(Math.max(Number(limit) || 20, 1), 50);
    const result = await sweepDueWatches(base44, watchLimit);

    return json(result);
  } catch (error) {
    return errorResponse(error, req);
  }
});
