// Base44's entities.EntityName.list()/.filter() take (sort, limit, skip) and
// return a plain array with no cursor and no total count
// (.agents/skills/base44-sdk/references/entities.md: "list(sort?, limit?,
// skip?, fields?)", max 5,000 rows per request). Offset (skip) is the only
// pagination mode the SDK exposes -- there is no cursor form to choose
// instead. The same offset/skip convention is already used server-side by
// `listAllOwned` in base44/shared/service-entities.ts for cascade deletes.
//
// `loadDashboard` (src/App.jsx) used to request a single page per entity
// with a hardcoded limit (20/100/200) and silently drop every row past that
// page (docs/BUGS_AND_BEHAVIORS.md G1; docs/DECISIONS.md "B7 pagination is
// UI-only"). `fetchAllPages` pages through every row up to a bounded
// ceiling instead, so an owner with more rows than the old single-page cap
// gets complete data.
//
// Unlike `listAllOwned` -- used only for destructive cascades, where hitting
// the ceiling must fail loud rather than silently complete a partial delete
// -- a read-only dashboard load degrades to a truncated-but-usable view
// instead of throwing: `hasMore`/`total` are returned so callers can surface
// "showing X of Y" instead of truncating with no indication anything is
// missing.

/** Matches the page size `listAllOwned` already uses server-side. */
export const DEFAULT_PAGE_SIZE = 200;

/**
 * Defensive ceiling on total rows fetched per entity per dashboard load.
 * 25x the largest single-page cap `loadDashboard` used before this change,
 * chosen to comfortably cover realistic owners in one or a few requests
 * while still bounding worst-case load time/requests for an outlier owner.
 * Revisit if this stops being enough (docs/DECISIONS.md).
 */
export const DEFAULT_MAX_ROWS = 5000;

/**
 * Pages through `fetchPage(skip, limit) => Promise<T[]>` (an offset-based
 * list call) collecting every row, stopping when a page comes back shorter
 * than requested (exhausted) or the row ceiling is reached (`hasMore: true`).
 *
 * `total` is an exact count when every row was fetched, or `null` when the
 * ceiling cut the fetch short (a lower bound is available as `items.length`).
 *
 * Propagates any error from `fetchPage` immediately without resolving, so a
 * mid-pagination failure never yields a partial-but-reported-complete result
 * -- the caller's existing failure handling (e.g. `loadDashboard`'s
 * catch block leaving prior state in place) applies unchanged.
 */
export async function fetchAllPages(fetchPage, { pageSize = DEFAULT_PAGE_SIZE, maxRows = DEFAULT_MAX_ROWS } = {}) {
  if (!Number.isInteger(pageSize) || pageSize <= 0) {
    throw new Error("fetchAllPages: pageSize must be a positive integer");
  }
  const items = [];
  let skip = 0;
  let hasMore = false;
  for (;;) {
    const page = await fetchPage(skip, pageSize);
    items.push(...page);
    if (page.length < pageSize) break;
    if (items.length >= maxRows) {
      hasMore = true;
      break;
    }
    skip += pageSize;
  }
  return { items, hasMore, total: hasMore ? null : items.length };
}
