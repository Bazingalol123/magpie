import { listAllOwned } from "../base44/shared/service-entities.ts";

function fakeEntity(rows: Array<{ id: string; owner_id: string }>) {
  return {
    filter: async (query: Record<string, unknown>, _sort?: string, limit?: number, skip = 0) =>
      rows
        .filter((row) => Object.entries(query).every(([key, value]) => (row as any)[key] === value))
        .slice(skip, skip + (limit ?? rows.length)),
  };
}

function assertEquals(actual: unknown, expected: unknown, message = "Values differ") {
  const left = JSON.stringify(actual);
  const right = JSON.stringify(expected);
  if (left !== right) throw new Error(`${message}\nexpected: ${right}\nactual:   ${left}`);
}

Deno.test("listAllOwned pages through multiple short pages and finds every owned row", async () => {
  const rows = Array.from({ length: 7 }, (_, index) => ({ id: `row-${index}`, owner_id: "owner-1" }));
  const entity = fakeEntity(rows);

  const result = await listAllOwned(entity, { owner_id: "owner-1" }, "owner-1", 2);

  assertEquals(result.length, 7, "every row across pages must be collected");
  assertEquals(result.map((row) => row.id).sort(), rows.map((row) => row.id).sort(), "no row may be missed or duplicated");
});

Deno.test("listAllOwned drops rows belonging to another owner even if the backend query returns them", async () => {
  const rows = [
    { id: "row-1", owner_id: "owner-1" },
    { id: "row-2", owner_id: "owner-2" },
    { id: "row-3", owner_id: "owner-1" },
  ];
  const entity = fakeEntity(rows);

  const result = await listAllOwned(entity, {}, "owner-1", 2);

  assertEquals(result.map((row) => row.id).sort(), ["row-1", "row-3"], "cross-owner rows must never be included");
});

Deno.test("listAllOwned stops at a short page instead of looping forever", async () => {
  const rows = Array.from({ length: 4 }, (_, index) => ({ id: `row-${index}`, owner_id: "owner-1" }));
  const entity = fakeEntity(rows);
  let calls = 0;
  const countingEntity = {
    filter: async (...args: Parameters<typeof entity.filter>) => {
      calls += 1;
      return entity.filter(...args);
    },
  };

  const result = await listAllOwned(countingEntity, { owner_id: "owner-1" }, "owner-1", 2);

  assertEquals(result.length, 4, "expected all rows across exactly two full pages");
  assertEquals(calls, 3, "expected two full pages plus one short page confirming the end");
});

Deno.test("listAllOwned fails loud instead of silently truncating an oversized cascade", async () => {
  const rows = Array.from({ length: 10 }, (_, index) => ({ id: `row-${index}`, owner_id: "owner-1" }));
  const entity = fakeEntity(rows);

  let threw = false;
  try {
    await listAllOwned(entity, { owner_id: "owner-1" }, "owner-1", 2, 5);
  } catch {
    threw = true;
  }
  if (!threw) throw new Error("expected listAllOwned to throw when maxRows is exceeded");
});
