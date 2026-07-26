import { cascadeRecord, requireOwned } from "./record-removal.ts";
import { deleteIfPresent, getOrNull, listAllOwned } from "./service-entities.ts";

/**
 * Owner-requested permanent removal of one Collection and every Record inside
 * it (docs/API_AND_FAILURE_MAP.md `delete-collection`). Reuses the same
 * per-record cascade `delete-record` uses, just applied over every owned
 * Record in the Collection. Every row is owner-checked before the first
 * delete; missing rows are skipped so a partial failure is completed by
 * retrying. The Collection is deleted last as the anchor: a retry that
 * cannot find it reads as already done (404).
 */

export type RemoveCollectionResult = {
  deleted: {
    watch_rules: number;
    enrichments: number;
    decisions: number;
    clips: number;
    records: number;
    collections: number;
  };
};

export async function removeCollection(
  service: any,
  ownerId: string,
  collectionId: string,
): Promise<RemoveCollectionResult> {
  const collection = requireOwned(await getOrNull(service.Collection, collectionId), ownerId, "Collection");

  const records = await listAllOwned<{ id: string; clip_id?: string; owner_id: string }>(
    service.Record,
    { owner_id: ownerId, collection_id: collection.id },
    ownerId,
  );

  const deleted = { watch_rules: 0, enrichments: 0, decisions: 0, clips: 0, records: 0, collections: 0 };
  for (const record of records) {
    const counts = await cascadeRecord(service, ownerId, record);
    deleted.watch_rules += counts.watch_rules;
    deleted.enrichments += counts.enrichments;
    deleted.decisions += counts.decisions;
    deleted.clips += counts.clips;
    deleted.records += counts.records;
  }
  if (await deleteIfPresent(service.Collection, collection.id)) deleted.collections += 1;

  return { deleted };
}
