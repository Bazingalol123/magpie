import {
  parseResolveRoutingCommand,
  resolveRouting,
} from "../base44/shared/routing-resolution.ts";
import { HttpError } from "../base44/shared/http.ts";

const PRODUCT_SCHEMA = [
  { name: "title", label: "Title", type: "string" },
  { name: "price", label: "Price", type: "number" },
] as const;

function fakeBase44Service(seed: Record<string, any[]> = {}) {
  const tables: Record<string, any[]> = {};
  const counters: Record<string, number> = {};
  for (const name of ["Clip", "Collection", "Record", "RoutingDecision", "Mission"]) {
    tables[name] = (seed[name] ?? []).map((row) => ({ ...row }));
    counters[name] = tables[name].length;
  }
  const service = Object.fromEntries(Object.keys(tables).map((name) => [
    name,
    {
      get: async (id: string) => tables[name].find((row) => row.id === id) ?? null,
      filter: async (query: Record<string, unknown>, _sort?: string, limit?: number) =>
        tables[name]
          .filter((row) => Object.entries(query).every(([key, value]) => row[key] === value))
          .slice(0, limit ?? tables[name].length),
      create: async (data: Record<string, unknown>) => {
        const row = { id: `${name.toLowerCase()}-${++counters[name]}`, ...data };
        tables[name].push(row);
        return row;
      },
      update: async (id: string, changes: Record<string, unknown>) => {
        const index = tables[name].findIndex((row) => row.id === id);
        if (index < 0) throw new Error(`${name} ${id} not found`);
        tables[name][index] = { ...tables[name][index], ...changes };
        return tables[name][index];
      },
      delete: async (id: string) => {
        const index = tables[name].findIndex((row) => row.id === id);
        if (index < 0) throw new Error(`Entity ${name} with ID ${id} not found`);
        tables[name].splice(index, 1);
      },
    },
  ]));
  return { service, tables };
}

function reviewClip(overrides: Record<string, unknown> = {}) {
  return {
    id: "clip-1",
    owner_id: "owner-1",
    source_url: "https://shop.example/item",
    raw_text: "Travel charger 39",
    captured_at: "2026-07-24T10:00:00.000Z",
    status: "needs_review",
    routing_status: "needs_review",
    attempt_count: 1,
    ...overrides,
  };
}

function reviewDecision(overrides: Record<string, unknown> = {}) {
  return {
    id: "decision-1",
    owner_id: "owner-1",
    clip_id: "clip-1",
    outcome: "review",
    suggested_name: "Products",
    suggested_schema_json: JSON.stringify(PRODUCT_SCHEMA),
    confidence: 0.62,
    reason_codes_json: JSON.stringify(["ambiguous_candidates"]),
    classifier_version: "v3-routing-agent-1",
    decided_at: "2026-07-24T10:00:05.000Z",
    ...overrides,
  };
}

function collection(overrides: Record<string, unknown> = {}) {
  return {
    id: "collection-products",
    owner_id: "owner-1",
    name: "Products",
    schema_json: JSON.stringify(PRODUCT_SCHEMA),
    schema_version: 1,
    status: "active",
    ...overrides,
  };
}

function assert(condition: unknown, message = "Assertion failed"): asserts condition {
  if (!condition) throw new Error(message);
}

function assertEquals(actual: unknown, expected: unknown, message = "Values differ") {
  const left = JSON.stringify(actual);
  const right = JSON.stringify(expected);
  if (left !== right) throw new Error(`${message}\nexpected: ${right}\nactual:   ${left}`);
}

async function assertThrowsHttp(
  callback: () => Promise<unknown>,
  status: number,
  message = `expected HttpError ${status}`,
) {
  try {
    await callback();
  } catch (error) {
    if (error instanceof HttpError) {
      assertEquals(error.status, status, message);
      return error;
    }
    throw error;
  }
  throw new Error(`${message}: no error was thrown`);
}

Deno.test("accept creates one Collection and one Record from the audited suggestion", async () => {
  const { service, tables } = fakeBase44Service({
    Clip: [reviewClip()],
    RoutingDecision: [reviewDecision()],
  });

  const result = await resolveRouting(service, "owner-1", { action: "accept", clipId: "clip-1" });

  assertEquals(result.collection.name, "Products", "expected Collection from the suggested name");
  assertEquals(tables.Collection.length, 1, "expected exactly one Collection");
  assertEquals(tables.Record.length, 1, "expected exactly one Record");
  assertEquals(tables.Clip[0].routing_status, "created_collection", "expected the Clip to leave review");
  assertEquals(tables.RoutingDecision[0].corrected_collection_id, result.collection.id, "expected audited correction");
  assert(tables.RoutingDecision[0].corrected_at, "expected a correction timestamp");
});

Deno.test("accept without a stored suggestion is rejected instead of inventing a name", async () => {
  const { service } = fakeBase44Service({
    Clip: [reviewClip()],
    RoutingDecision: [reviewDecision({ suggested_name: undefined, suggested_schema_json: undefined })],
  });

  await assertThrowsHttp(
    () => resolveRouting(service, "owner-1", { action: "accept", clipId: "clip-1" }),
    400,
    "accept must fail with no durable suggestion to accept",
  );
});

Deno.test("redirect moves a needs_review Clip into an eligible existing Collection", async () => {
  const { service, tables } = fakeBase44Service({
    Clip: [reviewClip()],
    Collection: [collection()],
    RoutingDecision: [reviewDecision()],
  });

  const result = await resolveRouting(service, "owner-1", {
    action: "redirect",
    clipId: "clip-1",
    collectionId: "collection-products",
  });

  assertEquals(result.collection.id, "collection-products", "expected the chosen Collection");
  assertEquals(tables.Record.length, 1, "expected exactly one Record");
  assertEquals(tables.Clip[0].routing_status, "routed_existing", "expected a resolved Clip");
  assertEquals(tables.RoutingDecision[0].outcome, "review", "original proposal outcome must remain auditable");
  assertEquals(tables.RoutingDecision[0].reason_codes_json, reviewDecision().reason_codes_json, "original reasons must remain auditable");
});

Deno.test("create approves a new bounded Collection and creates at most one Record", async () => {
  const { service, tables } = fakeBase44Service({
    Clip: [reviewClip()],
    RoutingDecision: [reviewDecision()],
  });

  const result = await resolveRouting(service, "owner-1", {
    action: "create",
    clipId: "clip-1",
    collectionName: "Chargers",
    collectionDescription: "Portable chargers being compared",
    schema: [...PRODUCT_SCHEMA],
  });

  assertEquals(result.collection.name, "Chargers", "expected the owner-approved name");
  assertEquals(tables.Collection.length, 1, "expected at most one Collection");
  assertEquals(tables.Record.length, 1, "expected at most one Record");
  assertEquals(tables.Clip[0].routing_status, "created_collection", "expected creation status");
});

Deno.test("redirect to a Collection owned by another user is rejected", async () => {
  const { service, tables } = fakeBase44Service({
    Clip: [reviewClip()],
    Collection: [collection({ id: "collection-other", owner_id: "owner-2" })],
    RoutingDecision: [reviewDecision()],
  });

  await assertThrowsHttp(
    () =>
      resolveRouting(service, "owner-1", {
        action: "redirect",
        clipId: "clip-1",
        collectionId: "collection-other",
      }),
    403,
    "cross-owner Collection must be rejected",
  );
  assertEquals(tables.Record.length, 0, "must not create a Record on a rejected call");
});

Deno.test("resolving a Clip that is not awaiting review is a conflict", async () => {
  const { service, tables } = fakeBase44Service({
    Clip: [reviewClip({ routing_status: "routed_existing", status: "ready" })],
    Collection: [collection()],
    RoutingDecision: [reviewDecision({ outcome: "existing", selected_collection_id: "collection-products" })],
  });

  await assertThrowsHttp(
    () =>
      resolveRouting(service, "owner-1", {
        action: "redirect",
        clipId: "clip-1",
        collectionId: "collection-products",
      }),
    409,
    "an already-routed Clip outside review must be a conflict",
  );
  assertEquals(tables.Record.length, 0, "must not create a Record on a rejected call");
});

Deno.test("retrying the identical resolution is idempotent and creates no duplicate", async () => {
  const { service, tables } = fakeBase44Service({
    Clip: [reviewClip()],
    Collection: [collection()],
    RoutingDecision: [reviewDecision()],
  });
  const command = { action: "redirect" as const, clipId: "clip-1", collectionId: "collection-products" };

  const first = await resolveRouting(service, "owner-1", command);
  const retry = await resolveRouting(service, "owner-1", command);

  assert(retry.duplicate, "retry must report the existing resolution");
  assertEquals(retry.record.id, first.record.id, "retry must return the same Record");
  assertEquals(retry.collection.id, first.collection.id, "retry must return the same Collection");
  assertEquals(tables.Record.length, 1, "must not duplicate the Record");
  assertEquals(tables.Collection.length, 1, "must not duplicate the Collection");
});

Deno.test("a conflicting retry with a different target after resolution is a conflict", async () => {
  const { service } = fakeBase44Service({
    Clip: [reviewClip()],
    Collection: [
      collection(),
      collection({ id: "collection-other-camera", name: "Other stuff", owner_id: "owner-1" }),
    ],
    RoutingDecision: [reviewDecision()],
  });

  await resolveRouting(service, "owner-1", {
    action: "redirect",
    clipId: "clip-1",
    collectionId: "collection-products",
  });

  await assertThrowsHttp(
    () =>
      resolveRouting(service, "owner-1", {
        action: "redirect",
        clipId: "clip-1",
        collectionId: "collection-other-camera",
      }),
    409,
    "a second, different resolution attempt must be a conflict, not a silent overwrite",
  );
});

Deno.test("parseResolveRoutingCommand validates action-shaped input", () => {
  assertEquals(
    parseResolveRoutingCommand({ action: "redirect", clip_id: "clip-1", collection_id: "collection-1" }),
    { action: "redirect", clipId: "clip-1", collectionId: "collection-1" },
  );

  const missingClip = assertThrowsSync(
    () => parseResolveRoutingCommand({ action: "accept" }),
    HttpError,
  );
  assertEquals(missingClip.status, 400, "clip_id is required");

  const badAction = assertThrowsSync(
    () => parseResolveRoutingCommand({ action: "delete", clip_id: "clip-1" }),
    HttpError,
  );
  assertEquals(badAction.status, 400, "unknown action must be rejected");

  const missingCollectionId = assertThrowsSync(
    () => parseResolveRoutingCommand({ action: "redirect", clip_id: "clip-1" }),
    HttpError,
  );
  assertEquals(missingCollectionId.status, 400, "redirect requires a collection_id");

  const missingSchema = assertThrowsSync(
    () =>
      parseResolveRoutingCommand({
        action: "create",
        clip_id: "clip-1",
        collection_name: "Chargers",
      }),
    HttpError,
  );
  assertEquals(missingSchema.status, 400, "create requires a schema");
});

Deno.test("a hosted not-found throw from entity get maps to 404, not 500", async () => {
  const { service } = fakeBase44Service({ RoutingDecision: [reviewDecision()] });
  service.Clip.get = async (id: string) => {
    throw new Error(`Entity Clip with ID ${id} not found`);
  };

  await assertThrowsHttp(
    () => resolveRouting(service, "owner-1", { action: "accept", clipId: "missing-clip" }),
    404,
    "the hosted SDK throws on missing IDs instead of returning null",
  );
});

Deno.test("create rejects an unsafe owner-supplied Collection name", async () => {
  const { service, tables } = fakeBase44Service({
    Clip: [reviewClip()],
    RoutingDecision: [reviewDecision()],
  });

  await assertThrowsHttp(
    () =>
      resolveRouting(service, "owner-1", {
        action: "create",
        clipId: "clip-1",
        collectionName: "https://not-a-safe-name.example",
        schema: [...PRODUCT_SCHEMA],
      }),
    400,
    "unsafe Collection names must be rejected the same way routeToNew rejects them",
  );
  assertEquals(tables.Collection.length, 0, "must not create a Collection for a rejected name");
});

function assertThrowsSync<T extends Error>(
  callback: () => unknown,
  errorType: new (...args: any[]) => T,
): T {
  try {
    callback();
  } catch (error) {
    if (error instanceof errorType) return error;
    throw error;
  }
  throw new Error("Expected function to throw");
}

Deno.test("dismiss deletes the review capture and its routing decision", async () => {
  const { service, tables } = fakeBase44Service({
    Clip: [reviewClip()],
    RoutingDecision: [reviewDecision()],
  });

  const result = await resolveRouting(service, "owner-1", { action: "dismiss", clipId: "clip-1" });

  assert("dismissed" in result && result.dismissed, "expected a dismissed result");
  assertEquals(tables.Clip.length, 0, "the capture must be deleted");
  assertEquals(tables.RoutingDecision.length, 0, "the decision must be deleted");
  assertEquals(tables.Record.length, 0, "no Record may appear from a dismissal");
});

Deno.test("dismiss refuses a capture that is not awaiting review", async () => {
  const { service, tables } = fakeBase44Service({
    Clip: [reviewClip({ routing_status: "routed_existing", status: "ready" })],
    RoutingDecision: [reviewDecision({ outcome: "existing" })],
  });

  await assertThrowsHttp(
    () => resolveRouting(service, "owner-1", { action: "dismiss", clipId: "clip-1" }),
    409,
    "an organized capture must be removed through delete-record, not dismiss",
  );
  assertEquals(tables.Clip.length, 1, "the capture must survive");
});

Deno.test("dismiss retry after success returns 404, which callers treat as done", async () => {
  const { service } = fakeBase44Service({
    Clip: [reviewClip()],
    RoutingDecision: [reviewDecision()],
  });

  await resolveRouting(service, "owner-1", { action: "dismiss", clipId: "clip-1" });
  await assertThrowsHttp(
    () => resolveRouting(service, "owner-1", { action: "dismiss", clipId: "clip-1" }),
    404,
  );
});

Deno.test("dismiss completes even when only the orphaned capture remains", async () => {
  const { service, tables } = fakeBase44Service({ Clip: [reviewClip()] });

  const result = await resolveRouting(service, "owner-1", { action: "dismiss", clipId: "clip-1" });

  assert("dismissed" in result && result.dismissed, "a missing decision must not block dismissal");
  assertEquals(tables.Clip.length, 0, "the capture is still deleted");
});

Deno.test("create scoped to an owned active Project stamps every durable row", async () => {
  const { service, tables } = fakeBase44Service({
    Clip: [reviewClip()],
    RoutingDecision: [reviewDecision()],
    Mission: [{ id: "project-1", owner_id: "owner-1", title: "Chargers", status: "active" }],
  });

  const result = await resolveRouting(service, "owner-1", {
    action: "create",
    clipId: "clip-1",
    collectionName: "Chargers",
    schema: [...PRODUCT_SCHEMA],
    projectId: "project-1",
  });

  assertEquals(result.collection.mission_id, "project-1", "the Collection must be Project-scoped");
  assertEquals(tables.Record[0].mission_id, "project-1", "the Record must be Project-scoped");
  assertEquals(tables.Clip[0].mission_id, "project-1", "the Clip must retain the Project");
});

Deno.test("create with a cross-owner or inactive Project never falls back to global", async () => {
  const { service, tables } = fakeBase44Service({
    Clip: [reviewClip()],
    RoutingDecision: [reviewDecision()],
    Mission: [
      { id: "project-other", owner_id: "owner-2", title: "Theirs", status: "active" },
      { id: "project-archived", owner_id: "owner-1", title: "Old", status: "archived" },
    ],
  });

  await assertThrowsHttp(
    () =>
      resolveRouting(service, "owner-1", {
        action: "create",
        clipId: "clip-1",
        collectionName: "Chargers",
        schema: [...PRODUCT_SCHEMA],
        projectId: "project-other",
      }),
    403,
  );
  await assertThrowsHttp(
    () =>
      resolveRouting(service, "owner-1", {
        action: "create",
        clipId: "clip-1",
        collectionName: "Chargers",
        schema: [...PRODUCT_SCHEMA],
        projectId: "project-archived",
      }),
    409,
  );
  await assertThrowsHttp(
    () =>
      resolveRouting(service, "owner-1", {
        action: "create",
        clipId: "clip-1",
        collectionName: "Chargers",
        schema: [...PRODUCT_SCHEMA],
        projectId: "project-missing",
      }),
    404,
  );
  assertEquals(tables.Collection.length, 0, "no Collection may be created for a rejected Project");
});

Deno.test("parse accepts dismiss and a create project_id", () => {
  assertEquals(
    parseResolveRoutingCommand({ action: "dismiss", clip_id: "clip-1" }),
    { action: "dismiss", clipId: "clip-1" },
  );

  const created = parseResolveRoutingCommand({
    action: "create",
    clip_id: "clip-1",
    collection_name: "Chargers",
    schema: [...PRODUCT_SCHEMA],
    project_id: "project-1",
  });
  assert(created.action === "create" && created.projectId === "project-1", "project_id must parse");

  const badProject = assertThrowsSync(
    () =>
      parseResolveRoutingCommand({
        action: "create",
        clip_id: "clip-1",
        collection_name: "Chargers",
        schema: [...PRODUCT_SCHEMA],
        project_id: "bad id!",
      }),
    HttpError,
  );
  assertEquals(badProject.status, 400, "a malformed project_id must be rejected");
});
