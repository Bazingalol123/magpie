import { HttpError } from "./http.ts";
import { deleteIfPresent, getOrNull, listAllOwned } from "./service-entities.ts";

/**
 * Owner-requested permanent removal of one Item and everything derived from or
 * supporting it (docs/API_AND_FAILURE_MAP.md `delete-record`). Every row is
 * owner-checked before the first delete; missing rows are skipped so a partial
 * failure is completed by retrying. The Record is deleted last as the anchor: a
 * retry that cannot find it reads as already done (404).
 */

export type RecordCascadeCounts = {
  watch_rules: number;
  enrichments: number;
  decisions: number;
  clips: number;
  records: number;
};

export type RemoveRecordResult = {
  deleted: RecordCascadeCounts;
};

export async function removeRecord(
  service: any,
  ownerId: string,
  recordId: string,
): Promise<RemoveRecordResult> {
  const record = requireOwned(await getOrNull(service.Record, recordId), ownerId, "Item");
  const deleted = await cascadeRecord(service, ownerId, record);
  return { deleted };
}

/**
 * Deletes one already-fetched, owner-verified Record and everything derived
 * from or supporting it: WatchRules, Enrichments, RoutingDecision, and Clip.
 * Shared by `removeRecord` and the Collection/Mission cascades so every
 * caller deletes an Item the same way.
 */
export async function cascadeRecord(
  service: any,
  ownerId: string,
  record: { id: string; clip_id?: string },
): Promise<RecordCascadeCounts> {
  const clip = record.clip_id ? await getOrNull(service.Clip, record.clip_id) : null;
  if (clip && clip.owner_id !== ownerId) {
    throw new HttpError(403, "Capture belongs to another owner");
  }

  const watchRules = await listAllOwned<{ id: string; owner_id: string }>(
    service.WatchRule,
    { owner_id: ownerId, record_id: record.id },
    ownerId,
  );
  const enrichments = await listAllOwned<{ id: string; owner_id: string }>(
    service.Enrichment,
    { owner_id: ownerId, record_id: record.id },
    ownerId,
  );
  const decisions = record.clip_id
    ? await listAllOwned<{ id: string; owner_id: string }>(
      service.RoutingDecision,
      { owner_id: ownerId, clip_id: record.clip_id },
      ownerId,
    )
    : [];

  const deleted: RecordCascadeCounts = { watch_rules: 0, enrichments: 0, decisions: 0, clips: 0, records: 0 };
  for (const watch of watchRules) {
    if (await deleteIfPresent(service.WatchRule, watch.id)) deleted.watch_rules += 1;
  }
  for (const enrichment of enrichments) {
    if (await deleteIfPresent(service.Enrichment, enrichment.id)) deleted.enrichments += 1;
  }
  for (const decision of decisions) {
    if (await deleteIfPresent(service.RoutingDecision, decision.id)) deleted.decisions += 1;
  }
  if (clip && await deleteIfPresent(service.Clip, clip.id)) deleted.clips += 1;
  if (await deleteIfPresent(service.Record, record.id)) deleted.records += 1;

  return deleted;
}

export function requireOwned<T extends { owner_id: string }>(row: T | null | undefined, ownerId: string, label: string): T {
  if (!row) throw new HttpError(404, `${label} not found`);
  if (row.owner_id !== ownerId) throw new HttpError(403, `${label} belongs to another owner`);
  return row;
}
