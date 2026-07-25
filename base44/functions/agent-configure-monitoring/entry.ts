import { createClientFromRequest } from "npm:@base44/sdk";
import { requireUser } from "../../shared/auth.ts";
import {
  configureWatch,
  parseWatchCommand,
} from "../../shared/agent-tools.ts";
import { corsHeaders, errorResponse, json, readJson, requirePost } from "../../shared/http.ts";

Deno.serve(async (req) => {
  try {
    if (requirePost(req)) return new Response(null, { status: 204, headers: corsHeaders });

    const base44 = createClientFromRequest(req);
    const user = await requireUser(base44);
    const command = parseWatchCommand(await readJson(req));
    const service = base44.asServiceRole.entities;
    const { created, watch } = await configureWatch(service, user.id, command);

    return json({
      created,
      watch: {
        id: watch.id,
        record_id: watch.record_id,
        condition: watch.natural_language_condition,
        frequency: watch.frequency,
        active: watch.active,
        next_check_at: watch.next_check_at,
      },
    }, created ? 201 : 200);
  } catch (error) {
    return errorResponse(error);
  }
});
