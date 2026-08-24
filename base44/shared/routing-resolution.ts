import { HttpError } from "./http.ts";
import { deleteIfPresent, getOrNull } from "./service-entities.ts";
import {
  collectionNameKey,
  isSafeCollectionName,
  normalizeCollectionName,
  normalizeRoutingSchema,
  schemaSignature,
  type RoutingField,
} from "./routing.ts";

/**
 * Owner-triggered correction for a `needs_review` Clip
 * (docs/API_AND_FAILURE_MAP.md, docs/V3_1_PRODUCT_AND_RISK_PLAN.md). Only
 * operates on Clips currently awaiting review; resolving an already-routed
 * Clip is a conflict rather than a silent re-route.
 */

export type ResolveRoutingCommand =
  | { action: "accept"; clipId: string }
  | { action: "redirect"; clipId: string; collectionId: string }
  | { action: "dismiss"; clipId: string }
  | {
    action: "create";
    clipId: string;
    collectionName: string;
    collectionDescription?: string;
    schema: RoutingField[];
    projectId?: string;
  };

export type ResolveRoutingResult = {
  clip?: any;
  decision?: any;
  collection?: any;
  record?: any;
  duplicate?: boolean;
  dismissed?: true;
  clip_id?: string;
};

export function parseResolveRoutingCommand(
  input: Record<string, unknown>,
): ResolveRoutingCommand {
  const action = input.action;
  if (action !== "accept" && action !== "redirect" && action !== "create" && action !== "dismiss") {
    throw new HttpError(400, "action must be accept, redirect, create, or dismiss");
  }
  const clipId = requiredId(input.clip_id, "clip_id");

  if (action === "accept" || action === "dismiss") return { action, clipId };

  if (action === "redirect") {
    const collectionId = requiredId(input.collection_id, "collection_id");
    return { action, clipId, collectionId };
  }

  const collectionName = requiredText(input.collection_name, "collection_name", 2, 80);
  const schema = normalizeRoutingSchema(input.schema);
  if (!schema) throw new HttpError(400, "schema is required and must be a valid field list");
  const projectId = input.project_id === undefined || input.project_id === null || input.project_id === ""
    ? undefined
    : requiredId(input.project_id, "project_id");
  return {
    action,
    clipId,
    collectionName,
    collectionDescription: boundedString(input.collection_description, 240),
    schema,
    projectId,
  };
}

export async function resolveRouting(
  service: any,
  ownerId: string,
  command: ResolveRoutingCommand,
): Promise<ResolveRoutingResult> {
  const clip = requireOwned(await getOrNull(service.Clip, command.clipId), ownerId, "Capture");

  if (command.action === "dismiss") {
    if (clip.routing_status !== "needs_review") {
      throw new HttpError(409, "This capture is not awaiting review");
    }
    const orphanedDecision = await first(service.RoutingDecision, { owner_id: ownerId, clip_id: clip.id });
    if (orphanedDecision) await deleteIfPresent(service.RoutingDecision, orphanedDecision.id);
    await deleteIfPresent(service.Clip, clip.id);
    return { dismissed: true, clip_id: clip.id };
  }

  const decision = await first(service.RoutingDecision, { owner_id: ownerId, clip_id: clip.id });
  if (!decision) throw new HttpError(404, "Routing decision not found");

  if (clip.routing_status !== "needs_review") {
    if (await matchesPriorResolution(service, command, decision)) {
      return hydrateResolved(service, clip, decision);
    }
    throw new HttpError(409, "This capture is not awaiting review");
  }

  let missionId = clip.mission_id;
  let collection: any;
  let created: boolean;
  if (command.action === "redirect") {
    collection = requireOwned(await getOrNull(service.Collection, command.collectionId), ownerId, "Collection");
    if (collection.status === "archived" || collection.collection_type === "saved_search") {
      throw new HttpError(409, "The selected Collection is not active");
    }
    created = false;
  } else {
    if (command.action === "create" && command.projectId) {
      const project = requireOwned(await getOrNull(service.Mission, command.projectId), ownerId, "Project");
      if (project.status !== "active") throw new HttpError(409, "The selected Project is not active");
      missionId = project.id;
    }
    const suggestion = command.action === "accept" ? acceptedSuggestion(decision) : {
      name: command.collectionName,
      description: command.collectionDescription,
      schema: command.schema,
    };
    collection = await createValidatedCollection(service, ownerId, missionId, suggestion);
    created = true;
  }

  const record = await service.Record.create({
    owner_id: ownerId,
    collection_id: collection.id,
    clip_id: clip.id,
    fields_json: "{}",
    source_url: clip.source_url,
    mission_id: missionId,
    schema_version: Number(collection.schema_version ?? 1),
    decision_status: "inbox",
    processing_status: "needs_review",
    confidence: Number(decision.confidence ?? 0),
    freshness: "fresh",
    next_action: "Finish reviewing this item's details.",
  });

  const updatedDecision = await service.RoutingDecision.update(decision.id, {
    corrected_collection_id: collection.id,
    corrected_at: new Date().toISOString(),
    resolution_state: "resolved",
  });

  const updatedClip = await service.Clip.update(clip.id, {
    collection_id: collection.id,
    mission_id: missionId,
    routing_status: created ? "created_collection" : "routed_existing",
    status: "ready",
  });

  return { clip: updatedClip, decision: updatedDecision, collection, record, duplicate: false };
}

function acceptedSuggestion(decision: any) {
  const name = typeof decision.suggested_name === "string" ? decision.suggested_name : undefined;
  const schema = parseSuggestedSchema(decision.suggested_schema_json);
  if (!name || !schema) {
    throw new HttpError(400, "No suggestion is available to accept");
  }
  return { name, description: undefined, schema };
}

function parseSuggestedSchema(value: unknown): RoutingField[] | undefined {
  if (typeof value !== "string") return undefined;
  try {
    return normalizeRoutingSchema(JSON.parse(value)) ?? undefined;
  } catch {
    return undefined;
  }
}

async function createValidatedCollection(
  service: any,
  ownerId: string,
  missionId: string | undefined,
  suggestion: { name: string; description?: string; schema: RoutingField[] },
) {
  const name = normalizeCollectionName(suggestion.name);
  if (!isSafeCollectionName(name)) {
    throw new HttpError(400, "Collection name is not safe to create");
  }
  const schema = normalizeRoutingSchema(suggestion.schema);
  if (!schema) throw new HttpError(400, "Collection schema is invalid");

  return await service.Collection.create({
    owner_id: ownerId,
    name,
    description: boundedString(suggestion.description, 240),
    mission_id: missionId,
    normalized_key: scopedCollectionKey(ownerId, missionId, name),
    schema_json: JSON.stringify(schema),
    schema_signature: schemaSignature(schema),
    schema_version: 1,
    routing_profile_json: JSON.stringify({ aliases: [] }),
    collection_type: "structured",
    status: "active",
    origin: "user",
    is_shared_readonly: false,
  });
}

async function matchesPriorResolution(
  service: any,
  command: Exclude<ResolveRoutingCommand, { action: "dismiss" }>,
  decision: any,
): Promise<boolean> {
  if (!decision.corrected_collection_id) return false;
  if (command.action === "redirect") {
    return decision.corrected_collection_id === command.collectionId;
  }
  const collection = await getOrNull(service.Collection, decision.corrected_collection_id);
  if (!collection) return false;
  const expectedName = command.action === "accept"
    ? decision.suggested_name
    : normalizeCollectionName(command.collectionName);
  return collection.name === expectedName;
}

async function hydrateResolved(service: any, clip: any, decision: any): Promise<ResolveRoutingResult> {
  const collection = decision.corrected_collection_id
    ? await getOrNull(service.Collection, decision.corrected_collection_id)
    : undefined;
  const record = await first(service.Record, { owner_id: clip.owner_id, clip_id: clip.id });
  return { clip, decision, collection, record, duplicate: true };
}

function scopedCollectionKey(ownerId: string, missionId: string | undefined, normalizedName: string) {
  return `${ownerId}|${missionId ?? "global"}|${collectionNameKey(normalizedName)}`.slice(0, 180);
}

function requireOwned<T extends { owner_id: string }>(row: T | null | undefined, ownerId: string, label: string): T {
  if (!row) throw new HttpError(404, `${label} not found`);
  if (row.owner_id !== ownerId) throw new HttpError(403, `${label} belongs to another owner`);
  return row;
}

async function first(entity: any, query: Record<string, unknown>) {
  const rows = await entity.filter(query, "-created_date", 1);
  return rows[0];
}

function requiredId(value: unknown, field: string): string {
  if (typeof value !== "string" || !/^[A-Za-z0-9_-]{1,160}$/.test(value)) {
    throw new HttpError(400, `${field} is required`);
  }
  return value;
}

function requiredText(value: unknown, field: string, minimum: number, maximum: number): string {
  if (typeof value !== "string") throw new HttpError(400, `${field} must be text`);
  const normalized = value.trim();
  if (normalized.length < minimum || normalized.length > maximum) {
    throw new HttpError(400, `${field} must be between ${minimum} and ${maximum} characters`);
  }
  return normalized;
}

function boundedString(value: unknown, maxLength: number) {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, maxLength) : undefined;
}
