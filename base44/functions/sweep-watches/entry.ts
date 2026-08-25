import { createClientFromRequest } from "npm:@base44/sdk";
import { sweepDueWatches } from "../../shared/watch-sweep.ts";
import { corsHeaders, errorResponse, json, readJson, requirePost } from "../../shared/http.ts";

Deno.serve(async (req) => {
  try {
    if (requirePost(req)) return new Response(null, { status: 204, headers: corsHeaders });

    const base44 = createClientFromRequest(req);
    const caller = await base44.auth.me();
    if (!caller || caller.role !== "admin") return json({ error: "Admin authorization is required" }, 403);

    // A scheduled trigger (Base44 automation or the GitHub Actions fallback)
    // may not send a body at all; readJson() 400s on an empty body, which
    // would silently break every scheduled run before it even starts.
    const { limit } = await readJson(req).catch(() => ({}));
    const watchLimit = Math.min(Math.max(Number(limit) || 20, 1), 50);
    const result = await sweepDueWatches(base44, watchLimit);

    return json(result);
  } catch (error) {
    return errorResponse(error, req);
  }
});
