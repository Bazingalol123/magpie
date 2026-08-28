export const emptyData = { missions: [], collections: [], records: [], clips: [], enrichments: [], routingDecisions: [], watchRules: [], refreshAttempts: [], extensionInstalls: [] };
export const emptyPageMeta = { hasMore: false, total: 0 };
export const emptyDataMeta = {
  missions: emptyPageMeta,
  collections: emptyPageMeta,
  records: emptyPageMeta,
  clips: emptyPageMeta,
  enrichments: emptyPageMeta,
  routingDecisions: emptyPageMeta,
  watchRules: emptyPageMeta,
  refreshAttempts: emptyPageMeta,
  extensionInstalls: emptyPageMeta,
};

export const DASHBOARD_LIST_LIMIT = 100;
export const RECORDS_PAGE_SIZE = 8;

export const listDashboardPage = (entityHandler, sort) => entityHandler.list(sort, DASHBOARD_LIST_LIMIT, 0);

// Color is status only, never category (docs/DESIGN_SYSTEM.md) -- this
// replaces an earlier hash-of-id dot color the owner rejected (docs/
// DECISIONS.md, "Dashboard redesign, R1"). A Collection gets a dot only
// when something real is currently true of it: a record mid-check right
// now (live), an unreachable source (error), or a source needing sign-in
// (review) -- in that priority order. No dot is the normal case.
export function collectionDotStatus(collection, records, refreshingRecordId) {
  const collectionRecords = records.filter((record) => record.collection_id === collection.id);
  if (refreshingRecordId && collectionRecords.some((record) => record.id === refreshingRecordId)) return "live";
  if (collectionRecords.some((record) => record.freshness === "unreachable")) return "error";
  if (collectionRecords.some((record) => record.freshness === "blocked")) return "review";
  return null;
}
