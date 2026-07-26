import { cascadeRecord, requireOwned } from "./record-removal.ts";
import { deleteIfPresent, getOrNull, listAllOwned } from "./service-entities.ts";

/**
 * Owner-requested permanent removal of one Project (Mission) and every
 * Collection scoped to it, cascading through the same per-record removal
 * `delete-record`/`delete-collection` use (docs/API_AND_FAILURE_MAP.md
 * `delete-mission`). Every row is owner-checked before the first delete;
 * missing rows are skipped so a partial failure is completed by retrying.
 * The Mission is deleted last as the anchor.
 *
 * Deliberately does not touch Clips that merely carry this Mission as a
 * routing hint but never produced a Collection/Record (docs/DECISIONS.md);
 * only Collections scoped to the Mission via `mission_id` are cascaded.
 */

export type RemoveMissionResult = {
  deleted: {
    watch_rules: number;
    enrichments: number;
    decisions: number;
    clips: number;
    records: number;
    collections: number;
    missions: number;
  };
};

export async function removeMission(
  service: any,
  ownerId: string,
  missionId: string,
): Promise<RemoveMissionResult> {
  const mission = requireOwned(await getOrNull(service.Mission, missionId), ownerId, "Project");

  const collections = await listAllOwned<{ id: string; owner_id: string }>(
    service.Collection,
    { owner_id: ownerId, mission_id: mission.id },
    ownerId,
  );

  const deleted = {
    watch_rules: 0,
    enrichments: 0,
    decisions: 0,
    clips: 0,
    records: 0,
    collections: 0,
    missions: 0,
  };

  for (const collection of collections) {
    const records = await listAllOwned<{ id: string; clip_id?: string; owner_id: string }>(
      service.Record,
      { owner_id: ownerId, collection_id: collection.id },
      ownerId,
    );
    for (const record of records) {
      const counts = await cascadeRecord(service, ownerId, record);
      deleted.watch_rules += counts.watch_rules;
      deleted.enrichments += counts.enrichments;
      deleted.decisions += counts.decisions;
      deleted.clips += counts.clips;
      deleted.records += counts.records;
    }
    if (await deleteIfPresent(service.Collection, collection.id)) deleted.collections += 1;
  }

  if (await deleteIfPresent(service.Mission, mission.id)) deleted.missions += 1;

  return { deleted };
}
