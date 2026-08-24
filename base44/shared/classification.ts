import { HttpError } from "./http.ts";
import {
  normalizeRoutingFields,
  normalizeRoutingSchema,
  type RoutingCollection,
  type RoutingField,
} from "./routing.ts";
import type { RoutingProject } from "./project-routing.ts";

export type RoutingProposalContext = {
  clip: {
    source_url: string;
    context_url?: string;
    raw_text: string;
    capture_mode?: string;
    screenshot_id?: string;
  };
  mission?: {
    id: string;
    title?: string;
    goal?: string;
    constraints_json?: string;
  } | null;
  projects?: RoutingProject[];
  collections: RoutingCollection[];
};

const ROUTING_RESPONSE_FORMAT = {
  type: "json_schema",
  json_schema: {
    name: "routing_proposal",
    strict: true,
    schema: {
      type: "object",
      additionalProperties: false,
      required: [
        "outcome",
        "existing_collection_id",
        "collection_name",
        "collection_description",
        "summary",
        "schema_fields",
        "record_fields",
        "confidence",
        "reason_codes",
      ],
      properties: {
        outcome: { type: "string", enum: ["existing", "new", "review"] },
        existing_collection_id: { type: ["string", "null"] },
        collection_name: { type: ["string", "null"] },
        collection_description: { type: ["string", "null"] },
        summary: {
          type: "string",
          description: "One or two plain-language sentences describing what this capture is, for a user reviewing it later. No markdown.",
        },
        schema_fields: {
          type: "array",
          maxItems: 12,
          items: {
            type: "object",
            additionalProperties: false,
            required: ["name", "label", "type"],
            properties: {
              name: { type: "string" },
              label: { type: "string" },
              type: { type: "string", enum: ["string", "number", "boolean"] },
            },
          },
        },
        record_fields: {
          type: "array",
          maxItems: 12,
          items: {
            type: "object",
            additionalProperties: false,
            required: ["name", "value"],
            properties: {
              name: { type: "string" },
              value: { type: "string" },
            },
          },
        },
        confidence: { type: "number", minimum: 0, maximum: 1 },
        reason_codes: {
          type: "array",
          items: {
            type: "string",
            enum: [
              "existing_schema_match",
              "mission_scope_match",
              "global_scope_match",
              "no_equivalent_collection",
              "ambiguous_candidates",
              "mixed_content",
            ],
          },
        },
      },
    },
  },
};

/**
 * Requests an untrusted but structurally constrained routing proposal. The V3
 * deterministic validator still owns every routing decision and mutation.
 */
export async function requestRoutingProposal(
  base44: any,
  context: RoutingProposalContext,
): Promise<unknown> {
  return requestAgentRoutingProposal(base44, context);
}

/**
 * Runs the bounded routing code agent. Its tools only expose trusted context
 * already scoped by persistence code, and its finish tool returns a proposal;
 * no agent tool can write an entity.
 */
export async function requestAgentRoutingProposal(
  base44: any,
  context: RoutingProposalContext,
  fetchImpl: typeof fetch = fetch,
): Promise<unknown> {
  const { baseURL, token } = base44.asServiceRole.aiGateway.connection();
  const messages: Array<Record<string, unknown>> = [
    {
      role: "system",
      content: [
        "Organize one web capture by deciding its optional Project and reusable Collection together.",
        "First inspect Projects and Collections with the supplied tools.",
        "An explicit Project is locked and must never be replaced.",
        "Never choose a Project by recency. Choose project only for one clear semantic match; use global for no match and review for ambiguity.",
        "For a Project assignment, submit up to three candidate scores. The selected Project needs a very clear lead.",
        "Prefer an eligible existing Collection when its schema fits.",
        "A Project is context, never a Collection type or naming prefix.",
        "For new Collections use a stable plural object name in the capture's natural language and 2-12 reusable schema fields.",
        "Extract only visible facts. Use review for mixed content, weak evidence, ambiguity, or an unsupported shape.",
        "Always include summary: one or two plain-language sentences describing what was captured (what it is, and the one or two most useful facts), written for a person reviewing this later. Plain prose, no markdown, no restating the raw text verbatim.",
        "Finish by calling submit_route_proposal exactly once. That tool proposes only; deterministic server code owns validation and writes.",
      ].join(" "),
    },
    {
      role: "user",
      content: routingUserContent(context),
    },
  ];
  const inspected = { projects: false, collections: false };
  let submitted: unknown;

  for (let step = 0; step < 4 && !submitted; step += 1) {
    const response = await fetchImpl(`${baseURL.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "automatic",
        temperature: 0.1,
        messages,
        tools: ROUTING_AGENT_TOOLS,
        tool_choice: "auto",
      }),
    });
    if (!response.ok) throw new HttpError(502, "The routing agent did not respond");
    const body = await response.json();
    const message = body?.choices?.[0]?.message;
    const toolCalls = Array.isArray(message?.tool_calls) ? message.tool_calls : [];
    if (!toolCalls.length) throw new HttpError(502, "The routing agent did not finish with a tool");
    if (toolCalls.length > 6) throw new HttpError(502, "The routing agent requested too many tools");
    const canSubmit = inspected.projects && inspected.collections;
    messages.push({
      role: "assistant",
      content: message.content ?? null,
      tool_calls: toolCalls,
    });

    for (const call of toolCalls) {
      const name = call?.function?.name;
      const args = parseToolArguments(call?.function?.arguments);
      let result: unknown;
      if (name === "list_projects") {
        inspected.projects = true;
        result = projectSummaries(context);
      } else if (name === "list_collections") {
        inspected.collections = true;
        result = collectionSummaries(context, args?.project_id);
      } else if (name === "submit_route_proposal") {
        if (!canSubmit) {
          result = { accepted: false, error: "Inspect Projects and Collections before submitting." };
        } else {
          submitted = args;
          result = { accepted: true };
        }
      } else {
        result = { error: "Unknown tool" };
      }
      messages.push({
        role: "tool",
        tool_call_id: call?.id,
        name,
        content: JSON.stringify(result),
      });
    }
  }

  if (!submitted) throw new HttpError(502, "The routing agent reached its step limit");
  return adaptRoutingProposal(submitted);
}

/**
 * Retained as a rollback provider for the pre-agent structured classifier.
 */
export async function requestStructuredRoutingProposal(
  base44: any,
  context: RoutingProposalContext,
): Promise<unknown> {
  const { baseURL, token } = base44.asServiceRole.aiGateway.connection();
  const response = await fetch(`${baseURL.replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "automatic",
      temperature: 0.1,
      response_format: ROUTING_RESPONSE_FORMAT,
      messages: [
        {
          role: "system",
          content: [
            "Route one web capture into a reusable Collection.",
            "Return exactly one JSON object shaped {outcome, existing_collection_id, collection_name, collection_description, summary, schema_fields, record_fields, confidence, reason_codes}.",
            "outcome is existing, new, or review.",
            "summary is one or two plain-language sentences describing what was captured, for a person reviewing it later. Plain prose, no markdown, no restating the raw text verbatim.",
            "Prefer an eligible existing Collection when its schema fits.",
            "A Mission is optional context, never a Collection type or naming prefix.",
            "schema_fields is an array of reusable columns shaped {name,label,type}; type is string, number, or boolean.",
            "record_fields is an array shaped {name,value}; every name matches schema_fields and every value is a visible fact represented as a string.",
            "For visual or image captures, the supplied image crop is evidence; extract only facts visible in that crop or the accompanying text.",
            "Never put a schema label in schema_fields, never put field definitions in record_fields, and never swap these keys.",
            "For new Collections use a stable plural object name in the capture's natural language and 2-12 schema_fields.",
            "Do not translate Hebrew Collection names merely to satisfy English plural grammar.",
            "Choose review for mixed content, ambiguity, weak evidence, or an unsupported shape.",
            "Reason codes may only be: existing_schema_match, mission_scope_match, global_scope_match, no_equivalent_collection, ambiguous_candidates, mixed_content.",
            "Example: {\"outcome\":\"new\",\"existing_collection_id\":null,\"collection_name\":\"Cameras\",\"collection_description\":\"Cameras being compared\",\"summary\":\"A Nikon D500 DSLR camera body listed for comparison.\",\"schema_fields\":[{\"name\":\"model\",\"label\":\"Model\",\"type\":\"string\"},{\"name\":\"camera_type\",\"label\":\"Camera type\",\"type\":\"string\"}],\"record_fields\":[{\"name\":\"model\",\"value\":\"Nikon D500\"},{\"name\":\"camera_type\",\"value\":\"DSLR\"}],\"confidence\":0.9,\"reason_codes\":[\"no_equivalent_collection\"]}.",
          ].join(" "),
        },
        {
          role: "user",
          content: structuredRoutingUserContent(context),
        },
      ],
    }),
  });
  if (!response.ok) throw new HttpError(502, "The routing model did not respond");
  const body = await response.json();
  return adaptRoutingProposal(body?.choices?.[0]?.message?.content);
}

export function routingUserContent(context: RoutingProposalContext): string | Array<Record<string, unknown>> {
  const text = JSON.stringify({
    capture_mode: context.clip.capture_mode ?? "element",
    source_url: context.clip.source_url,
    context_url: context.clip.context_url ?? null,
    raw_text: context.clip.raw_text.slice(0, 12_000),
    mission: context.mission
      ? {
        id: context.mission.id,
        title: context.mission.title,
        goal: context.mission.goal,
        constraints: context.mission.constraints_json,
      }
      : null,
    active_project_count: context.projects?.length ?? (context.mission ? 1 : 0),
    eligible_collection_count: context.collections.length,
  });
  const mode = context.clip.capture_mode;
  const screenshotUrl = context.clip.screenshot_id;
  if ((mode === "visual" || mode === "image") && isHttpImageUrl(screenshotUrl)) {
    return [
      { type: "text", text },
      { type: "image_url", image_url: { url: screenshotUrl } },
    ];
  }
  return text;
}

function structuredRoutingUserContent(
  context: RoutingProposalContext,
): string | Array<Record<string, unknown>> {
  const base = routingUserContent(context);
  const details = {
    eligible_collections: context.collections.map((collection) => ({
      id: collection.id,
      name: collection.name,
      description: (collection as any).description,
      mission_id: collection.mission_id ?? null,
      schema: collection.schema ?? collection.schema_json,
      routing_profile: collection.routing_profile_json,
    })),
  };
  if (typeof base === "string") {
    return JSON.stringify({ ...JSON.parse(base), ...details });
  }
  const [textPart, ...imageParts] = base;
  const parsedText = typeof textPart?.text === "string" ? JSON.parse(textPart.text) : {};
  return [{ ...textPart, text: JSON.stringify({ ...parsedText, ...details }) }, ...imageParts];
}

export function adaptRoutingProposal(value: unknown): unknown {
  const parsed = parseRoutingObject(value);
  if (!parsed) return value;

  const schema = parsed.schema_fields ??
    adaptSchemaShape(parsed.schema) ??
    (Array.isArray(parsed.fields) && parsed.fields.every(isFieldDefinition)
      ? parsed.fields
      : parsed.schema);
  const fields = adaptRecordFields(parsed.record_fields) ??
    objectValue(parsed.record_values) ??
    objectValue(parsed.fields) ??
    adaptRecordFields(parsed.fields) ??
    {};

  return {
    project_assignment: parsed.project_assignment,
    project_id: parsed.project_id,
    project_confidence: parsed.project_confidence,
    project_candidates: parsed.project_candidates,
    outcome: parsed.outcome,
    existing_collection_id: parsed.existing_collection_id,
    collection_name: parsed.collection_name,
    collection_description: parsed.collection_description,
    summary: typeof parsed.summary === "string" ? parsed.summary.trim().slice(0, 500) : undefined,
    schema,
    fields,
    confidence: parsed.confidence,
    reason_codes: parsed.reason_codes,
  };
}

const ROUTING_AGENT_TOOLS = [
  {
    type: "function",
    function: {
      name: "list_projects",
      description: "List the current owner's active Projects. Call this before choosing Project context.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {},
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_collections",
      description: "List eligible global Collections and, optionally, Collections in one active Project.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          project_id: {
            type: ["string", "null"],
            description: "Active Project ID to include with global Collections, or null for global only.",
          },
        },
        required: ["project_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "submit_route_proposal",
      description: "Submit the final Project and Collection proposal. This tool does not write data.",
      strict: true,
      parameters: {
        type: "object",
        additionalProperties: false,
        required: [
          "project_assignment",
          "project_id",
          "project_confidence",
          "project_candidates",
          "outcome",
          "existing_collection_id",
          "collection_name",
          "collection_description",
          "summary",
          "schema_fields",
          "record_fields",
          "confidence",
          "reason_codes",
        ],
        properties: {
          project_assignment: {
            type: "string",
            enum: ["explicit", "project", "global", "review"],
          },
          project_id: { type: ["string", "null"] },
          project_confidence: { type: "number", minimum: 0, maximum: 1 },
          project_candidates: {
            type: "array",
            maxItems: 3,
            items: {
              type: "object",
              additionalProperties: false,
              required: ["project_id", "score"],
              properties: {
                project_id: { type: "string" },
                score: { type: "number", minimum: 0, maximum: 1 },
              },
            },
          },
          ...ROUTING_RESPONSE_FORMAT.json_schema.schema.properties,
        },
      },
    },
  },
];

function projectSummaries(context: RoutingProposalContext) {
  const projects = context.projects ?? (context.mission ? [context.mission as RoutingProject] : []);
  return projects
    .filter((project) => project.status === undefined || project.status === "active")
    .slice(0, 50)
    .map((project) => ({
      id: project.id,
      title: project.title,
      goal: project.goal,
      constraints: project.constraints_json,
      explicit: project.id === context.mission?.id,
    }));
}

function collectionSummaries(context: RoutingProposalContext, projectId: unknown) {
  const validProjectIds = new Set(projectSummaries(context).map((project) => project.id));
  const requestedProjectId = typeof projectId === "string" && validProjectIds.has(projectId)
    ? projectId
    : undefined;
  return context.collections
    .filter((collection) =>
      !collection.mission_id || (requestedProjectId && collection.mission_id === requestedProjectId)
    )
    .slice(0, 200)
    .map((collection) => ({
      id: collection.id,
      name: collection.name,
      description: (collection as any).description,
      project_id: collection.mission_id ?? null,
      schema: collection.schema ?? collection.schema_json,
      routing_profile: collection.routing_profile_json,
    }));
}

function parseToolArguments(value: unknown): Record<string, unknown> | undefined {
  if (typeof value !== "string") return objectValue(value);
  try {
    return objectValue(JSON.parse(value));
  } catch {
    return undefined;
  }
}

function adaptSchemaShape(value: unknown): unknown {
  if (Array.isArray(value)) return value;
  const schemaObject = objectValue(value);
  if (!schemaObject) return undefined;
  const properties = objectValue(schemaObject.properties);
  const source = properties ?? schemaObject;
  return Object.entries(source).flatMap(([name, definition]) => {
    if (typeof definition === "string") {
      return [{ name, label: humanizeRoutingName(name), type: definition }];
    }
    const field = objectValue(definition);
    if (!field) return [];
    return [{
      name,
      label: typeof field.label === "string"
        ? field.label
        : typeof field.title === "string"
        ? field.title
        : humanizeRoutingName(name),
      type: field.type,
    }];
  });
}

function adaptRecordFields(value: unknown): Record<string, unknown> | undefined {
  if (!Array.isArray(value)) return undefined;
  const entries = value.flatMap((item) => {
    const field = objectValue(item);
    return typeof field?.name === "string" && "value" in field
      ? [[field.name, field.value] as const]
      : [];
  });
  return entries.length ? Object.fromEntries(entries) : undefined;
}

function parseRoutingObject(value: unknown): Record<string, unknown> | undefined {
  if (typeof value === "string") {
    try {
      return objectValue(JSON.parse(value.replace(/^```json\s*|\s*```$/gi, "")));
    } catch {
      return undefined;
    }
  }
  return objectValue(value);
}

function objectValue(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function isFieldDefinition(value: unknown) {
  const field = objectValue(value);
  return typeof field?.name === "string" && typeof field?.type === "string";
}

function humanizeRoutingName(value: string) {
  const words = value.replace(/_/g, " ");
  return `${words.charAt(0).toUpperCase()}${words.slice(1)}`.slice(0, 50);
}

function isHttpImageUrl(value: unknown): value is string {
  if (typeof value !== "string") return false;
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

type Classification = {
  collection_name: string;
  schema: RoutingField[];
  fields: Record<string, string | number | boolean>;
};

const FALLBACK: Classification = {
  collection_name: "Saved clips",
  schema: [
    { name: "title", label: "Title", type: "string" },
    { name: "summary", label: "Summary", type: "string" },
    { name: "source", label: "Source", type: "string" },
  ],
  fields: {},
};

const LEGACY_APARTMENT_SCHEMA: Classification["schema"] = [
  { name: "title", label: "Listing", type: "string" },
  { name: "rent", label: "Monthly rent", type: "string" },
  { name: "neighborhood", label: "Neighborhood", type: "string" },
  { name: "bedrooms", label: "Bedrooms", type: "string" },
  { name: "size_sqm", label: "Size", type: "string" },
  { name: "availability", label: "Availability", type: "string" },
];

export async function classifyCapture(base44: any, capture: { source_url: string; raw_text: string }) {
  const { baseURL, token } = base44.asServiceRole.aiGateway.connection();
  const response = await fetch(`${baseURL.replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "automatic",
      temperature: 0.1,
      messages: [
        {
          role: "system",
          content: "You classify one web clip into a reusable table. Return only a JSON object with collection_name, schema, and fields. schema is 2-6 items shaped {name,label,type}, type is string, number, or boolean. Use snake_case names. fields must use only schema names. Do not invent facts; use null-free values visible in the clip.",
        },
        {
          role: "user",
          content: JSON.stringify({ source_url: capture.source_url, raw_text: capture.raw_text.slice(0, 12_000) }),
        },
      ],
    }),
  });

  if (!response.ok) {
    throw new HttpError(502, "The classification model did not respond");
  }

  const body = await response.json();
  const content = body?.choices?.[0]?.message?.content;
  return normalizeClassification(content, capture);
}

export function fallbackClassification(capture: { source_url: string; raw_text: string }) {
  return normalizeClassification(JSON.stringify(FALLBACK), capture);
}

export async function classifyStoredClip(base44: any, clipId: string) {
  const clip = await base44.asServiceRole.entities.Clip.get(clipId);
  if (!clip) throw new HttpError(404, "Clip not found");

  const missions = await base44.asServiceRole.entities.Mission.filter({ owner_id: clip.owner_id, status: "active" }, "-created_date", 20);
  const mission = clip.mission_id
    ? await base44.asServiceRole.entities.Mission.get(clip.mission_id)
    : missions[0];
  if (mission && mission.owner_id !== clip.owner_id) throw new HttpError(403, "Mission belongs to another owner");

  let classification;
  try {
    classification = mission ? await classifyMissionCapture(base44, clip, mission) : await classifyCapture(base44, clip);
  } catch (classificationError) {
    console.error("AI classification unavailable; using deterministic fallback", classificationError);
    classification = fallbackClassification(clip);
  }

  const ownerCollections = await base44.asServiceRole.entities.Collection.filter({ owner_id: clip.owner_id }, "name", 100);
  let collection = ownerCollections.find((item: any) => item.collection_type !== "saved_search" && item.name.toLowerCase() === classification.collection_name.toLowerCase());
  if (!collection) {
    collection = await base44.asServiceRole.entities.Collection.create({
      owner_id: clip.owner_id,
      name: classification.collection_name,
      schema_json: JSON.stringify(classification.schema),
      collection_type: "structured",
      is_shared_readonly: false,
    });
  }

  const record = await base44.asServiceRole.entities.Record.create({
    owner_id: clip.owner_id,
    collection_id: collection.id,
    clip_id: clip.id,
    fields_json: JSON.stringify(classification.fields),
    source_url: clip.source_url,
    mission_id: mission?.id,
    schema_version: mission?.schema_version ?? 1,
    decision_status: "inbox",
    processing_status: Object.keys(classification.fields).length ? "ready" : "needs_review",
    confidence: Object.keys(classification.fields).length / Math.max(classification.schema.length, 1),
    freshness: "fresh",
    next_action: mission ? "Review this candidate against the Mission criteria." : "Review this captured item.",
  });
  await base44.asServiceRole.entities.Clip.update(clip.id, {
    collection_id: collection.id,
    mission_id: mission?.id,
    status: Object.keys(classification.fields).length ? "ready" : "needs_review",
  });

  return { clip, collection, record };
}

async function classifyMissionCapture(base44: any, capture: { source_url: string; raw_text: string }, mission: any): Promise<Classification> {
  const schema = normalizeStoredSchema(mission.schema_json, mission.domain);
  if (!schema.length) return fallbackClassification(capture);
  const { baseURL, token } = base44.asServiceRole.aiGateway.connection();
  const response = await fetch(`${baseURL.replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "automatic",
      temperature: 0.1,
      messages: [
        { role: "system", content: "Extract one candidate for the supplied decision Mission. Return only a JSON object shaped {fields}. Use only field names from schema. Leave fields absent when the value is not visible. Never invent unsupported facts." },
        { role: "user", content: JSON.stringify({ mission: mission.title, goal: mission.goal, constraints: mission.constraints_json, schema, source_url: capture.source_url, raw_text: capture.raw_text.slice(0, 12_000) }) },
      ],
    }),
  });
  if (!response.ok) throw new HttpError(502, "The Mission extraction model did not respond");
  const body = await response.json();
  let parsed: Record<string, unknown> = {};
  try {
    const content = body?.choices?.[0]?.message?.content;
    parsed = JSON.parse(typeof content === "string" ? content.replace(/^```json\s*|\s*```$/g, "") : "{}");
  } catch {
    parsed = {};
  }
  const inputFields = parsed.fields && typeof parsed.fields === "object" && !Array.isArray(parsed.fields)
    ? parsed.fields as Record<string, unknown>
    : parsed;
  const fields = normalizeRoutingFields(inputFields, schema);
  if (!fields.title) fields.title = capture.raw_text.split(/\n|\.|\s{2,}/)[0].slice(0, 140);
  return { collection_name: `Mission · ${mission.title}`.slice(0, 70), schema, fields };
}

function normalizeStoredSchema(value: unknown, domain?: string): Classification["schema"] {
  return normalizeRoutingSchema(value, 1, 8) ??
    (domain === "apartment_hunt" ? LEGACY_APARTMENT_SCHEMA : []);
}

function normalizeClassification(content: unknown, capture: { source_url: string; raw_text: string }): Classification {
  let parsed: Record<string, unknown> = {};
  try {
    parsed = JSON.parse(typeof content === "string" ? content.replace(/^```json\s*|\s*```$/g, "") : "{}");
  } catch {
    parsed = {};
  }

  const safeSchema = normalizeRoutingSchema(parsed.schema, 1, 6) ?? FALLBACK.schema;
  const inputFields = parsed.fields && typeof parsed.fields === "object" && !Array.isArray(parsed.fields)
    ? parsed.fields as Record<string, unknown>
    : {};
  const fields = normalizeRoutingFields(inputFields, safeSchema);

  if (!fields.title && safeSchema.some((field) => field.name === "title")) {
    fields.title = capture.raw_text.split(/\n|\.|\s{2,}/)[0].slice(0, 140);
  }
  if (!fields.source && safeSchema.some((field) => field.name === "source")) {
    fields.source = new URL(capture.source_url).hostname;
  }

  return {
    collection_name: String(parsed.collection_name ?? FALLBACK.collection_name).slice(0, 70),
    schema: safeSchema,
    fields,
  };
}
