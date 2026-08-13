import { requestRoutingProposal } from "./classification.ts";
import { HttpError } from "./http.ts";
import { getOrNull } from "./service-entities.ts";
import {
  resolveProjectRouting,
  type ProjectRoutingResult,
  type RoutingProject,
} from "./project-routing.ts";
import {
  collectionNameKey,
  normalizeCollectionName,
  routeCapture,
  type RoutingCollection,
  type RoutingResult,
} from "./routing.ts";

export const ROUTING_CLASSIFIER_VERSION = "v3-routing-agent-1";

export type RoutingProposalProvider = (
  base44: any,
  context: {
    clip: any;
    mission?: any | null;
    projects?: RoutingProject[];
    collections: RoutingCollection[];
  },
) => Promise<unknown>;

export type PersistedRoutingResult = {
  clip: any;
  decision: any;
  collection?: any;
  record?: any;
  duplicate: boolean;
};

export async function processStoredClip(
  base44: any,
  clipId: string,
  propose: RoutingProposalProvider = requestRoutingProposal,
): Promise<PersistedRoutingResult> {
  const service = base44.asServiceRole.entities;
  let clip = await getOrNull(service.Clip, clipId);
  if (!clip) throw new HttpError(404, "Clip not found");

  const existingDecision = await first(service.RoutingDecision, {
    owner_id: clip.owner_id,
    clip_id: clip.id,
  });
  if (existingDecision) return hydrateExistingResult(service, clip, existingDecision);

  const existingRecord = await first(service.Record, {
    owner_id: clip.owner_id,
    clip_id: clip.id,
  });
  if (existingRecord) return recoverPartialRecord(service, clip, existingRecord);

  const explicitMission = await loadExplicitMission(service, clip);
  const projects = await ownerProjects(service, clip.owner_id);
  await service.Clip.update(clip.id, {
    status: "processing",
    routing_status: "pending",
    processing_error: "",
    attempt_count: Number(clip.attempt_count ?? 0) + 1,
  });

  let collections = await ownerCollections(service, clip.owner_id);
  let result: RoutingResult;
  let proposal: unknown;
  let projectRouting = resolveProjectRouting({
    ownerId: clip.owner_id,
    explicitProject: explicitMission,
    projects,
  });
  let mission = projectRouting.project ?? null;
  try {
    proposal = await propose(base44, {
      clip,
      mission: explicitMission,
      projects,
      collections,
    });
    projectRouting = resolveProjectRouting({
      ownerId: clip.owner_id,
      explicitProject: explicitMission,
      projects,
      proposal,
    });
    mission = projectRouting.project ?? null;
    result = projectRouting.outcome === "review"
      ? projectReviewResult(projectRouting)
      : routeCapture({
        ownerId: clip.owner_id,
        missionId: mission?.id,
        collections,
        proposal,
      });
  } catch (error) {
    console.error("Routing proposal unavailable; sending Clip to review", error);
    result = routeCapture({
      ownerId: clip.owner_id,
      missionId: mission?.id,
      collections,
      aiError: true,
    });
  }

  // Re-read before a new Collection write to narrow the stale-read window.
  if (result.outcome === "new") {
    collections = await ownerCollections(service, clip.owner_id);
    result = routeCapture({
      ownerId: clip.owner_id,
      missionId: mission?.id,
      collections,
      proposal: {
        outcome: "new",
        collection_name: result.collection_name,
        collection_description: result.collection_description,
        schema: result.schema,
        fields: result.fields,
        confidence: result.confidence,
        reason_codes: result.reason_codes,
      },
    });
  }

  if (result.outcome === "review") {
    const decision = await service.RoutingDecision.create(
      decisionData(clip, mission, result, undefined, proposal, projectRouting),
    );
    clip = await service.Clip.update(clip.id, {
      collection_id: "",
      routing_status: "needs_review",
      routing_confidence: result.confidence,
      routing_reason_code: result.reason_codes[0] ?? "ambiguous_candidates",
      status: "needs_review",
      processing_error: "",
    });
    return { clip, decision, duplicate: false };
  }

  let collection: any;
  if (result.outcome === "existing") {
    collection = collections.find((candidate) => candidate.id === result.collection_id);
    if (!collection) throw new HttpError(409, "The selected Collection is no longer available");
  } else {
    collection = await service.Collection.create({
      owner_id: clip.owner_id,
      name: result.collection_name,
      description: result.collection_description,
      mission_id: mission?.id,
      normalized_key: scopedCollectionKey(clip.owner_id, mission?.id, result.normalized_name),
      schema_json: JSON.stringify(result.schema),
      schema_signature: result.schema_signature,
      schema_version: 1,
      routing_profile_json: JSON.stringify({ aliases: [] }),
      status: "active",
      origin: "agent",
      is_shared_readonly: false,
    });
  }

  const record = await service.Record.create({
    owner_id: clip.owner_id,
    collection_id: collection.id,
    clip_id: clip.id,
    fields_json: JSON.stringify(result.fields),
    source_url: clip.source_url,
    canonical_url: clip.canonical_url,
    mission_id: mission?.id,
    schema_version: Number(collection.schema_version ?? 1),
    decision_status: "inbox",
    processing_status: "ready",
    confidence: result.confidence,
    freshness: "fresh",
    next_action: mission
      ? "Review this organized item in its Project."
      : "Review this organized item.",
  });
  const decision = await service.RoutingDecision.create(
    decisionData(clip, mission, result, collection.id, proposal, projectRouting),
  );
  clip = await service.Clip.update(clip.id, {
    collection_id: collection.id,
    mission_id: mission?.id,
    routing_status: result.outcome === "new" ? "created_collection" : "routed_existing",
    routing_confidence: result.confidence,
    routing_reason_code: result.reason_codes[0],
    status: "ready",
    processing_error: "",
  });

  return { clip, decision, collection, record, duplicate: false };
}

export async function markRoutingFailed(base44: any, clipId: string, error: unknown) {
  const service = base44.asServiceRole.entities;
  const clip = await getOrNull(service.Clip, clipId);
  if (!clip) return;
  const decision = await first(service.RoutingDecision, {
    owner_id: clip.owner_id,
    clip_id: clip.id,
  });
  if (decision) return hydrateExistingResult(service, clip, decision);
  const record = await first(service.Record, {
    owner_id: clip.owner_id,
    clip_id: clip.id,
  });
  if (record) return recoverPartialRecord(service, clip, record);

  const failedDecision = await service.RoutingDecision.create({
    owner_id: clip.owner_id,
    clip_id: clip.id,
    mission_id: clip.mission_id,
    outcome: "failed",
    confidence: 0,
    reason_codes_json: JSON.stringify(["ai_unavailable"]),
    classifier_version: ROUTING_CLASSIFIER_VERSION,
    decided_at: new Date().toISOString(),
  });
  const updatedClip = await service.Clip.update(clip.id, {
    routing_status: "failed",
    routing_confidence: 0,
    routing_reason_code: "ai_unavailable",
    status: "failed",
    processing_error: safeError(error),
  });
  return { clip: updatedClip, decision: failedDecision, duplicate: false };
}

async function loadExplicitMission(service: any, clip: any) {
  if (!clip.mission_id) return null;
  const mission = await getOrNull(service.Mission, clip.mission_id);
  if (!mission || mission.owner_id !== clip.owner_id) {
    throw new HttpError(403, "Project context belongs to another owner");
  }
  if (mission.status !== "active") throw new HttpError(409, "The selected Project is unavailable");
  return mission;
}

async function ownerCollections(service: any, ownerId: string): Promise<RoutingCollection[]> {
  return await service.Collection.filter({ owner_id: ownerId }, "name", 200);
}

async function ownerProjects(service: any, ownerId: string): Promise<RoutingProject[]> {
  return await service.Mission.filter({ owner_id: ownerId, status: "active" }, "title", 50);
}

async function hydrateExistingResult(service: any, clip: any, decision: any) {
  const record = await first(service.Record, { owner_id: clip.owner_id, clip_id: clip.id });
  const collectionId = decision.corrected_collection_id ?? decision.selected_collection_id;
  const collection = collectionId ? await getOrNull(service.Collection, collectionId) : undefined;
  const desiredStatus = decision.outcome === "review"
    ? "needs_review"
    : decision.outcome === "failed"
    ? "failed"
    : clip.routing_status === "created_collection"
    ? "created_collection"
    : "routed_existing";
  if (clip.routing_status !== desiredStatus || (collectionId && clip.collection_id !== collectionId)) {
    clip = await service.Clip.update(clip.id, {
      collection_id: collectionId ?? "",
      routing_status: desiredStatus,
      routing_confidence: decision.confidence,
      routing_reason_code: parseReasons(decision.reason_codes_json)[0],
      status: desiredStatus === "needs_review"
        ? "needs_review"
        : desiredStatus === "failed"
        ? "failed"
        : "ready",
    });
  }
  return { clip, decision, collection, record, duplicate: true };
}

async function recoverPartialRecord(service: any, clip: any, record: any) {
  const collection = await getOrNull(service.Collection, record.collection_id);
  if (!collection || collection.owner_id !== clip.owner_id) {
    throw new HttpError(409, "The partially stored route is inconsistent");
  }
  const decision = await service.RoutingDecision.create({
    owner_id: clip.owner_id,
    clip_id: clip.id,
    mission_id: record.mission_id ?? clip.mission_id,
    outcome: "existing",
    selected_collection_id: collection.id,
    confidence: Number(record.confidence ?? 0),
    reason_codes_json: JSON.stringify(["existing_schema_match"]),
    classifier_version: ROUTING_CLASSIFIER_VERSION,
    decided_at: new Date().toISOString(),
  });
  const updatedClip = await service.Clip.update(clip.id, {
    collection_id: collection.id,
    mission_id: record.mission_id ?? clip.mission_id,
    routing_status: "routed_existing",
    routing_confidence: Number(record.confidence ?? 0),
    routing_reason_code: "existing_schema_match",
    status: "ready",
    processing_error: "",
  });
  return { clip: updatedClip, decision, collection, record, duplicate: true };
}

function decisionData(
  clip: any,
  mission: any,
  result: RoutingResult,
  collectionId?: string,
  proposal?: unknown,
  projectRouting?: ProjectRoutingResult,
) {
  const suggestion = proposalSuggestion(proposal);
  return {
    owner_id: clip.owner_id,
    clip_id: clip.id,
    mission_id: mission?.id,
    outcome: result.outcome,
    selected_collection_id: collectionId,
    suggested_name: suggestion.name,
    suggested_schema_json: suggestion.schemaJson,
    confidence: result.confidence,
    reason_codes_json: JSON.stringify(result.reason_codes),
    classifier_version: ROUTING_CLASSIFIER_VERSION,
    project_assignment: projectRouting
      ? projectRouting.source === "explicit"
        ? "explicit"
        : projectRouting.source === "agent"
        ? "agent"
        : projectRouting.outcome
        : undefined,
    project_confidence: projectRouting?.confidence,
    project_reason_codes_json: projectRouting
      ? JSON.stringify(projectRouting.reason_codes)
      : undefined,
    project_candidate_scores_json: projectRouting
      ? JSON.stringify(projectRouting.candidate_scores)
      : undefined,
    decided_at: new Date().toISOString(),
  };
}

function projectReviewResult(projectRouting: ProjectRoutingResult): RoutingResult {
  const primary = projectRouting.reason_codes[0];
  return {
    outcome: "review",
    confidence: projectRouting.confidence,
    reason_codes: [
      primary === "low_project_confidence"
        ? "low_confidence"
        : primary === "ambiguous_projects"
        ? "ambiguous_candidates"
        : "ineligible_scope",
    ],
  };
}

function proposalSuggestion(value: unknown) {
  const parsed = parseProposal(value);
  const name = typeof parsed?.collection_name === "string"
    ? normalizeCollectionName(parsed.collection_name).slice(0, 48) || undefined
    : undefined;
  const schema = Array.isArray(parsed?.schema)
    ? parsed.schema.slice(0, 8).flatMap((item) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) return [];
      const field = item as Record<string, unknown>;
      const fieldName = typeof field.name === "string"
        ? field.name.trim().slice(0, 64)
        : "";
      const fieldType = typeof field.type === "string"
        ? field.type.trim().slice(0, 32)
        : "";
      if (!fieldName || !fieldType) return [];
      return [{
        name: fieldName,
        label: typeof field.label === "string" ? field.label.trim().slice(0, 50) : undefined,
        type: fieldType,
      }];
    })
    : [];
  return {
    name,
    schemaJson: schema.length ? JSON.stringify(schema) : undefined,
  };
}

function parseProposal(value: unknown): Record<string, unknown> | undefined {
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value.replace(/^```json\s*|\s*```$/gi, ""));
      return parsed && typeof parsed === "object" && !Array.isArray(parsed)
        ? parsed as Record<string, unknown>
        : undefined;
    } catch {
      return undefined;
    }
  }
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function scopedCollectionKey(ownerId: string, missionId: string | undefined, normalizedName: string) {
  return `${ownerId}|${missionId ?? "global"}|${collectionNameKey(normalizedName)}`.slice(0, 180);
}

async function first(entity: any, query: Record<string, unknown>) {
  const rows = await entity.filter(query, "-created_date", 1);
  return rows[0];
}

function parseReasons(value: unknown): string[] {
  try {
    const parsed = typeof value === "string" ? JSON.parse(value) : value;
    return Array.isArray(parsed) ? parsed.filter((item) => typeof item === "string") : [];
  } catch {
    return [];
  }
}

function safeError(error: unknown) {
  return error instanceof Error ? error.message.slice(0, 240) : "Organization failed unexpectedly";
}
