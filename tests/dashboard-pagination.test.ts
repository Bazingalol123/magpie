import { assertEquals, assertRejects } from "jsr:@std/assert";
import { DEFAULT_PAGE_SIZE, fetchAllPages, fetchPageWindow } from "../src/dashboard-pagination.js";

// G1 (docs/BUGS_AND_BEHAVIORS.md): loadDashboard() used to fetch a single
// page per entity with a hardcoded limit (20/100/200), so an owner with more
// rows than that cap silently had older rows missing from the dashboard with
// no indication anything was truncated. These fixtures exercise the
// replacement pagination helper directly against fake owner-scoped rows,
// mirroring the offset/skip contract Base44's list()/filter() actually use
// (.agents/skills/base44-sdk/references/entities.md) and the same
// page-until-short-page convention base44/shared/service-entities.ts's
// listAllOwned already uses server-side for cascades.

/** A fake entity's offset-paginated list() over an in-memory row set, tracking call count/skip/limit for assertions. */
function fakeEntityList<T>(rows: T[]) {
  const calls: Array<{ skip: number; limit: number }> = [];
  const fetchPage = (skip: number, limit: number): Promise<T[]> => {
    calls.push({ skip, limit });
    return Promise.resolve(rows.slice(skip, skip + limit));
  };
  return { fetchPage, calls };
}

function makeRows(count: number) {
  return Array.from({ length: count }, (_, index) => ({ id: `row-${index}` }));
}

Deno.test("fetchPageWindow fetches one UI page plus one lookahead row", async () => {
  const rows = makeRows(10);
  const { fetchPage, calls } = fakeEntityList(rows);
  const result = await fetchPageWindow(fetchPage, 0, { pageSize: 8 });
  assertEquals(result.items.length, 8);
  assertEquals(result.items[7].id, "row-7");
  assertEquals(result.hasMore, true);
  assertEquals(calls, [{ skip: 0, limit: 9 }]);
});

Deno.test("fetchPageWindow requests only one server page when the last page is short", async () => {
  const rows = makeRows(10);
  const { fetchPage, calls } = fakeEntityList(rows);
  const result = await fetchPageWindow(fetchPage, 1, { pageSize: 8 });
  assertEquals(result.items.map((row: { id: string }) => row.id), ["row-8", "row-9"]);
  assertEquals(result.hasMore, false);
  assertEquals(calls, [{ skip: 8, limit: 9 }]);
});
Deno.test("fetchAllPages returns every row in a single request when under one page", async () => {
  const rows = makeRows(5);
  const { fetchPage, calls } = fakeEntityList(rows);
  const result = await fetchAllPages(fetchPage, { pageSize: 10 });
  assertEquals(result.items.length, 5);
  assertEquals(result.hasMore, false);
  assertEquals(result.total, 5);
  assertEquals(calls.length, 1);
});

Deno.test("fetchAllPages fetches every row for an owner with more than 200 rows in an entity (G1 fixture)", async () => {
  // Exactly the scenario the old `base44.entities.Record.list("-created_date", 200)`
  // cap silently dropped: an owner with 250 Records. Uses the real
  // DEFAULT_PAGE_SIZE (200) that loadDashboard's helper uses in production.
  const rows = makeRows(250);
  const { fetchPage, calls } = fakeEntityList(rows);
  const result = await fetchAllPages(fetchPage, { pageSize: DEFAULT_PAGE_SIZE });
  assertEquals(result.items.length, 250);
  assertEquals(result.items[249].id, "row-249");
  assertEquals(result.hasMore, false);
  assertEquals(result.total, 250);
  // One full page (200) plus one short page (50) proves pagination looped
  // past the old single-page cap instead of stopping at it.
  assertEquals(calls.length, 2);
  assertEquals(calls[0], { skip: 0, limit: 200 });
  assertEquals(calls[1], { skip: 200, limit: 200 });
});

Deno.test("fetchAllPages requests a confirming short page when the row count is an exact multiple of pageSize", async () => {
  const rows = makeRows(20);
  const { fetchPage, calls } = fakeEntityList(rows);
  const result = await fetchAllPages(fetchPage, { pageSize: 10 });
  assertEquals(result.items.length, 20);
  assertEquals(result.hasMore, false);
  assertEquals(result.total, 20);
  // Two full pages plus one confirming empty page.
  assertEquals(calls.length, 3);
});

Deno.test("fetchAllPages stops at the row ceiling and reports hasMore instead of paging forever", async () => {
  const rows = makeRows(1000);
  const { fetchPage, calls } = fakeEntityList(rows);
  const result = await fetchAllPages(fetchPage, { pageSize: 10, maxRows: 25 });
  assertEquals(result.hasMore, true);
  assertEquals(result.total, null);
  // Ceiling (25) is not a multiple of pageSize (10): stops after the third
  // page (30 rows fetched) once the accumulated count first reaches/exceeds it.
  assertEquals(result.items.length, 30);
  assertEquals(calls.length, 3);
});

Deno.test("fetchAllPages propagates a mid-pagination failure instead of returning a partial result", async () => {
  let calls = 0;
  const fetchPage = (_skip: number, limit: number) => {
    calls += 1;
    if (calls === 2) return Promise.reject(new Error("network blip"));
    return Promise.resolve(makeRows(limit));
  };
  const error = await assertRejects(
    () => fetchAllPages(fetchPage, { pageSize: 10 }),
    Error,
    "network blip",
  );
  assertEquals(error.message, "network blip");
  assertEquals(calls, 2);
});

Deno.test("fetchAllPages rejects a non-positive pageSize", async () => {
  await assertRejects(
    () => fetchAllPages(() => Promise.resolve([]), { pageSize: 0 }),
    Error,
    "pageSize must be a positive integer",
  );
});
