import { HttpError } from "./http.ts";
import { deleteIfPresent, getOrNull } from "./service-entities.ts";

export const ROUTING_UNDO_WINDOW_MS = 30_000;

export function parseUndoRoutingCommand(input: unknown) {
  const clipId = input && typeof input === "object" && typeof (input as Record<string, unknown>).clip_id === "string"
    ? (input as Record<string, string>).clip_id
    : "";
  if (!/^[A-Za-z0-9_-]{1,160}$/.test(clipId)) throw new HttpError(400, "clip_id is required");
  return { clipId };
}

export async function undoRoutingResolution(service: any, ownerId: string, clipId: string, now = new Date()) {
  const clip = await getOrNull(service.Clip, clipId);
  if (!clip) throw new HttpError(404, "Capture was not found");
  if (clip.owner_id !== ownerId) throw new HttpError(403, "This capture belongs to another workspace");
  if (clip.routing_status !== "created_collection") throw new HttpError(409, "Only a newly accepted route can be undone");

  const decisions = await service.RoutingDecision.filter({ owner_id: ownerId, clip_id: clip.id }, "-corrected_at", 1);
  const decision = decisions[0];
  if (!decision?.corrected_at || decision.resolution_state === "undone") throw new HttpError(409, "This route is not awaiting undo");
  if (now.getTime() - new Date(decision.corrected_at).getTime() > ROUTING_UNDO_WINDOW_MS) throw new HttpError(409, "The undo window has closed");

  const records = await service.Record.filter({ owner_id: ownerId, clip_id: clip.id }, "-created_date", 2);
  const record = records[0];
  if (!record) throw new HttpError(409, "The routed Item is no longer available to undo");
  const [watches, enrichments] = await Promise.all([
    service.WatchRule.filter({ owner_id: ownerId, record_id: record.id }, "-created_date", 1),
    service.Enrichment.filter({ owner_id: ownerId, record_id: record.id }, "-checked_at", 1),
  ]);
  if (watches.length || enrichments.length) throw new HttpError(409, "This Item already has activity and can no longer be undone safely");

  const collection = await getOrNull(service.Collection, decision.corrected_collection_id);
  const collectionRecords = collection
    ? await service.Record.filter({ owner_id: ownerId, collection_id: collection.id }, "-created_date", 2)
    : [];
  const undoneAt = now.toISOString();
  await deleteIfPresent(service.Record, record.id);
  if (collection && collection.owner_id === ownerId && collection.origin === "user" && collectionRecords.length === 1) {
    await deleteIfPresent(service.Collection, collection.id);
  }
  await service.RoutingDecision.update(decision.id, { resolution_state: "undone", undone_at: undoneAt });
  const restoredClip = await service.Clip.update(clip.id, { collection_id: "", routing_status: "needs_review", status: "needs_review" });
  return { undone: true, clip: restoredClip };
}
