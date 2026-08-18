import { createClientFromRequest } from "npm:@base44/sdk";
import { requireUser } from "../../shared/auth.ts";
import { corsHeaders, errorResponse, HttpError, json, readJson, requirePost } from "../../shared/http.ts";

type Field = { name: string; label: string; type: "string" | "number" | "boolean" };

const TEMPLATES: Record<string, { schema: Field[]; watch: string[] }> = {
  apartment: {
    schema: [
      { name: "title", label: "Listing", type: "string" },
      { name: "rent", label: "Monthly rent", type: "string" },
      { name: "neighborhood", label: "Neighborhood", type: "string" },
      { name: "bedrooms", label: "Bedrooms", type: "string" },
      { name: "size_sqm", label: "Size", type: "string" },
      { name: "availability", label: "Availability", type: "string" },
    ],
    watch: ["rent", "availability"],
  },
  product: {
    schema: [
      { name: "title", label: "Product", type: "string" },
      { name: "price", label: "Price", type: "string" },
      { name: "model", label: "Model", type: "string" },
      { name: "key_specs", label: "Key specs", type: "string" },
      { name: "availability", label: "Availability", type: "string" },
    ],
    watch: ["price", "availability"],
  },
  job: {
    schema: [
      { name: "title", label: "Role", type: "string" },
      { name: "company", label: "Company", type: "string" },
      { name: "location", label: "Location", type: "string" },
      { name: "compensation", label: "Compensation", type: "string" },
      { name: "employment_type", label: "Type", type: "string" },
      { name: "deadline", label: "Deadline", type: "string" },
    ],
    watch: ["deadline"],
  },
  custom: {
    schema: [
      { name: "title", label: "Candidate", type: "string" },
      { name: "summary", label: "Summary", type: "string" },
      { name: "price_or_value", label: "Price or value", type: "string" },
      { name: "availability", label: "Availability", type: "string" },
    ],
    watch: ["price_or_value", "availability"],
  },
};

Deno.serve(async (req) => {
  try {
    if (requirePost(req)) return new Response(null, { status: 204, headers: corsHeaders });

    const base44 = createClientFromRequest(req);
    const user = await requireUser(base44);
    const input = await readJson(req);
    const title = text(input.title, 120);
    if (!title) throw new HttpError(400, "A mission title is required");

    const template = typeof input.template === "string" && input.template in TEMPLATES ? input.template : "custom";
    const preset = TEMPLATES[template];
    const goal = text(input.goal, 600) || title;
    const criteria = text(input.criteria, 1_500);

    const mission = await base44.asServiceRole.entities.Mission.create({
      owner_id: user.id,
      title,
      goal,
      template,
      domain: template === "apartment" ? "apartment_hunt" : template,
      schema_json: JSON.stringify(preset.schema),
      schema_version: 1,
      constraints_json: JSON.stringify({ criteria }),
      ranking_policy_json: JSON.stringify({ hard_constraints: [], weights: {} }),
      watch_policy_json: JSON.stringify({ fields: preset.watch, frequency: "daily" }),
      status: "active",
    });

    return json({ mission }, 201);
  } catch (error) {
    return errorResponse(error, req);
  }
});

function text(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}
