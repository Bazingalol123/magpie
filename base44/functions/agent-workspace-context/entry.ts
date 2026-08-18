import { createClientFromRequest } from "npm:@base44/sdk";
import { requireUser } from "../../shared/auth.ts";
import {
  boundedLimit,
  boundedText,
  collectionSummary,
  optionalId,
  recordSummary,
  requireOwned,
  safeReasonCodes,
} from "../../shared/agent-tools.ts";
import { corsHeaders, errorResponse, json, readJson, requirePost } from "../../shared/http.ts";
import { getOrNull } from "../../shared/service-entities.ts";

Deno.serve(async (req) => {
  try {
    if (requirePost(req)) return new Response(null, { status: 204, headers: corsHeaders });

    const base44 = createClientFromRequest(req);
    const user = await requireUser(base44);
    const input = await readJson(req);
    const limit = boundedLimit(input.limit);
    const projectId = optionalId(input.project_id, "project_id");
    const collectionId = optionalId(input.collection_id, "collection_id");
    const recordId = optionalId(input.record_id, "record_id");
    const clipId = optionalId(input.clip_id, "clip_id");
    const service = base44.asServiceRole.entities;

    const selectedProject = projectId
      ? requireOwned(await getOrNull(service.Mission, projectId), user.id, "Project")
      : undefined;
    const selectedCollection = collectionId
      ? requireOwned(await getOrNull(service.Collection, collectionId), user.id, "Collection")
      : undefined;
    const selectedRecord = recordId
      ? requireOwned(await getOrNull(service.Record, recordId), user.id, "Item")
      : undefined;
    const selectedClip = clipId
      ? requireOwned(await getOrNull(service.Clip, clipId), user.id, "Capture")
      : undefined;

    const recordFilter = selectedRecord
      ? null
      : {
        owner_id: user.id,
        ...(collectionId ? { collection_id: collectionId } : {}),
        ...(projectId && !collectionId ? { mission_id: projectId } : {}),
        ...(clipId ? { clip_id: clipId } : {}),
      };
    const collectionFilter = selectedCollection
      ? null
      : { owner_id: user.id, ...(projectId ? { mission_id: projectId } : {}) };

    const [projects, collections, records, decisions, updates, watches] = await Promise.all([
      selectedProject
        ? Promise.resolve([selectedProject])
        : service.Mission.filter({ owner_id: user.id }, "-created_date", limit),
      selectedCollection
        ? Promise.resolve([selectedCollection])
        : service.Collection.filter(collectionFilter!, "name", limit),
      selectedRecord
        ? Promise.resolve([selectedRecord])
        : service.Record.filter(recordFilter!, "-updated_date", limit),
      service.RoutingDecision.filter(
        { owner_id: user.id, ...(clipId ? { clip_id: clipId } : {}) },
        "-decided_at",
        limit,
      ),
      service.Enrichment.filter({ owner_id: user.id }, "-checked_at", limit),
      service.WatchRule.filter(
        { owner_id: user.id, ...(recordId ? { record_id: recordId } : {}) },
        "-created_date",
        limit,
      ),
    ]);

    const collectionRows = [...collections];
    const knownCollectionIds = new Set(collectionRows.map((collection: any) => collection.id));
    const missingCollectionIds = [...new Set(
      records
        .map((record: any) => record.collection_id)
        .filter((id: unknown): id is string => typeof id === "string" && !knownCollectionIds.has(id)),
    )].slice(0, limit);
    for (const id of missingCollectionIds) {
      const collection = await getOrNull(service.Collection, id);
      if (collection) collectionRows.push(requireOwned(collection, user.id, "Collection"));
    }
    const collectionById = new Map(collectionRows.map((collection: any) => [collection.id, collection]));

    return json({
      scope: {
        project_id: selectedProject?.id,
        collection_id: selectedCollection?.id,
        record_id: selectedRecord?.id,
        clip_id: selectedClip?.id,
      },
      projects: projects.map((project: any) => ({
        id: project.id,
        title: boundedText(project.title, 120),
        goal: boundedText(project.goal, 600),
        status: boundedText(project.status, 40),
        constraints: safeObject(project.constraints_json, 8),
      })),
      collections: collectionRows.slice(0, limit).map(collectionSummary),
      items: records.slice(0, limit).map((record: any) =>
        recordSummary(record, collectionById.get(record.collection_id))
      ),
      routing: decisions.slice(0, limit).map((decision: any) => ({
        clip_id: decision.clip_id,
        project_id: decision.mission_id,
        project_assignment: decision.project_assignment,
        outcome: decision.outcome,
        selected_collection_id: decision.selected_collection_id,
        corrected_collection_id: decision.corrected_collection_id,
        confidence: decision.confidence,
        reason_codes: safeReasonCodes(decision.reason_codes_json),
        project_reason_codes: safeReasonCodes(decision.project_reason_codes_json, true),
        decided_at: decision.decided_at,
        corrected_at: decision.corrected_at,
      })),
      updates: updates.slice(0, limit).map((update: any) => ({
        record_id: update.record_id,
        field: boundedText(update.field, 80),
        old_value: boundedText(update.old_value, 500),
        new_value: boundedText(update.new_value, 500),
        checked_at: update.checked_at,
      })),
      watches: watches.slice(0, limit).map((watch: any) => ({
        id: watch.id,
        record_id: watch.record_id,
        condition: boundedText(watch.natural_language_condition, 500),
        frequency: watch.frequency,
        active: watch.active,
        last_checked_at: watch.last_checked_at,
        last_status: boundedText(watch.last_status, 80),
        next_check_at: watch.next_check_at,
      })),
      limits: { per_section: limit },
    });
  } catch (error) {
    return errorResponse(error, req);
  }
});

function safeObject(value: unknown, maximum: number) {
  if (typeof value !== "string") return {};
  try {
    const parsed = JSON.parse(value);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return Object.fromEntries(Object.entries(parsed).slice(0, maximum));
  } catch {
    return {};
  }
}
