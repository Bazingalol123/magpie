import { createClientFromRequest } from "npm:@base44/sdk";
import { requireExtensionPrincipal } from "../../shared/auth.ts";
import { corsHeaders, errorResponse, json, requirePostOrPut } from "../../shared/http.ts";

Deno.serve(async (req) => {
  try {
    if (requirePostOrPut(req)) return new Response(null, { status: 204, headers: corsHeaders });

    const base44 = createClientFromRequest(req);
    const { ownerId, pairing } = await requireExtensionPrincipal(base44, req, false);
    if (!pairing.paired_at) {
      await base44.asServiceRole.entities.ExtensionInstall.update(pairing.id, { paired_at: new Date().toISOString() });
    }
    const missions = await base44.asServiceRole.entities.Mission.filter(
      { owner_id: ownerId, status: "active" },
      "-created_date",
      50,
    );

    const projects = missions.map((mission: any) => ({
        id: mission.id,
        title: mission.title,
        template: mission.template ?? (mission.domain === "apartment_hunt" ? "apartment" : "custom"),
      }));
    return json({
      auto_organize: true,
      extension_id: pairing.id,
      projects,
      missions: projects,
    });
  } catch (error) {
    return errorResponse(error, req);
  }
});
