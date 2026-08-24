import { undoRoutingResolution } from "../base44/shared/routing-undo.ts";
import { HttpError } from "../base44/shared/http.ts";

function fakeService(overrides: Record<string, any[]> = {}) {
  const names = ["Clip", "RoutingDecision", "Record", "Collection", "WatchRule", "Enrichment"];
  const tables = Object.fromEntries(names.map((name) => [name, (overrides[name] ?? []).map((row) => ({ ...row }))]));
  const service = Object.fromEntries(names.map((name) => [name, {
    get: async (id: string) => tables[name].find((row: any) => row.id === id) ?? null,
    filter: async (query: Record<string, unknown>, _sort?: string, limit = 100) => tables[name].filter((row: any) => Object.entries(query).every(([key, value]) => row[key] === value)).slice(0, limit),
    update: async (id: string, changes: Record<string, unknown>) => {
      const index = tables[name].findIndex((row: any) => row.id === id);
      tables[name][index] = { ...tables[name][index], ...changes };
      return tables[name][index];
    },
    delete: async (id: string) => {
      const index = tables[name].findIndex((row: any) => row.id === id);
      if (index < 0) throw new Error(`${name} not found`);
      tables[name].splice(index, 1);
    },
  }]));
  return { service, tables };
}

const now = new Date("2026-08-24T12:00:10.000Z");
const base = {
  Clip: [{ id: "clip-1", owner_id: "owner-1", collection_id: "collection-1", routing_status: "created_collection", status: "ready" }],
  RoutingDecision: [{ id: "decision-1", owner_id: "owner-1", clip_id: "clip-1", corrected_collection_id: "collection-1", corrected_at: "2026-08-24T12:00:00.000Z", resolution_state: "resolved" }],
  Record: [{ id: "record-1", owner_id: "owner-1", clip_id: "clip-1", collection_id: "collection-1" }],
  Collection: [{ id: "collection-1", owner_id: "owner-1", origin: "user" }],
  WatchRule: [],
  Enrichment: [],
};

function assert(value: unknown, message: string) { if (!value) throw new Error(message); }
async function assertHttp(callback: () => Promise<unknown>, status: number) {
  try { await callback(); } catch (error) { if (error instanceof HttpError && error.status === status) return; throw error; }
  throw new Error(`expected HttpError ${status}`);
}

Deno.test("route undo restores the Clip and removes only the new Item and Collection", async () => {
  const { service, tables } = fakeService(base);
  const result = await undoRoutingResolution(service, "owner-1", "clip-1", now);
  assert(result.clip.routing_status === "needs_review", "Clip must return to Nest");
  assert(result.clip.collection_id === "", "route target must be cleared");
  assert(tables.Record.length === 0 && tables.Collection.length === 0, "new route artifacts must be removed");
  assert(tables.RoutingDecision[0].resolution_state === "undone", "decision must retain audited undo state");
});

Deno.test("route undo rejects another owner and an expired window", async () => {
  const { service } = fakeService(base);
  await assertHttp(() => undoRoutingResolution(service, "owner-2", "clip-1", now), 403);
  await assertHttp(() => undoRoutingResolution(service, "owner-1", "clip-1", new Date("2026-08-24T12:01:00.000Z")), 409);
});

Deno.test("route undo refuses an Item that already has auditable activity", async () => {
  const { service, tables } = fakeService({ ...base, Enrichment: [{ id: "e-1", owner_id: "owner-1", record_id: "record-1" }] });
  await assertHttp(() => undoRoutingResolution(service, "owner-1", "clip-1", now), 409);
  assert(tables.Record.length === 1 && tables.Collection.length === 1, "rejected undo must delete nothing");
});
