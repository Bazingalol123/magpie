import { processStoredClip } from "../base44/shared/routing-persistence.ts";

const PRODUCT_SCHEMA = [
  { name: "title", label: "Title", type: "string" },
  { name: "price", label: "Price", type: "number" },
] as const;

function fakeBase44(seed: Record<string, any[]> = {}) {
  const tables: Record<string, any[]> = {};
  const counters: Record<string, number> = {};
  for (const name of ["Clip", "Mission", "Collection", "Record", "RoutingDecision"]) {
    tables[name] = (seed[name] ?? []).map((row) => ({ ...row }));
    counters[name] = tables[name].length;
  }
  const entities = Object.fromEntries(Object.keys(tables).map((name) => [
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
    },
  ]));
  return {
    base44: { asServiceRole: { entities } },
    tables,
  };
}

function clip(overrides: Record<string, unknown> = {}) {
  return {
    id: "clip-1",
    owner_id: "owner-1",
    source_url: "https://shop.example/item",
    raw_text: "Travel charger 39",
    captured_at: "2026-07-24T10:00:00.000Z",
    status: "queued",
    routing_status: "pending",
    attempt_count: 0,
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

function existingProposal() {
  return {
    outcome: "existing",
    existing_collection_id: "collection-products",
    schema: PRODUCT_SCHEMA,
    fields: { title: "Travel charger", price: 39 },
    confidence: 0.94,
    reason_codes: ["existing_schema_match"],
  };
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function assertEquals(actual: unknown, expected: unknown, message: string) {
  const left = JSON.stringify(actual);
  const right = JSON.stringify(expected);
  if (left !== right) throw new Error(`${message}\nexpected: ${right}\nactual:   ${left}`);
}

Deno.test("existing route persists one Record, one decision, and the routed Clip", async () => {
  const { base44, tables } = fakeBase44({
    Clip: [clip()],
    Collection: [collection()],
  });

  const result = await processStoredClip(base44, "clip-1", async () => existingProposal());

  assertEquals(result.decision.outcome, "existing", "expected existing decision");
  assertEquals(tables.Record.length, 1, "expected one Record");
  assertEquals(tables.RoutingDecision.length, 1, "expected one routing decision");
  assertEquals(tables.Clip[0].routing_status, "routed_existing", "expected routed Clip");
  assertEquals(tables.Record[0].collection_id, "collection-products", "expected selected Collection");
});

Deno.test("retry returns durable identifiers without duplicate writes or another proposal", async () => {
  const { base44, tables } = fakeBase44({
    Clip: [clip()],
    Collection: [collection()],
  });
  let calls = 0;
  const propose = async () => {
    calls += 1;
    return existingProposal();
  };

  const first = await processStoredClip(base44, "clip-1", propose);
  const retry = await processStoredClip(base44, "clip-1", propose);

  assertEquals(calls, 1, "retry must not call the model");
  assert(retry.duplicate, "retry must report an existing result");
  assertEquals(retry.decision.id, first.decision.id, "expected same decision");
  assertEquals(retry.record.id, first.record.id, "expected same Record");
  assertEquals(tables.Record.length, 1, "must not duplicate Record");
  assertEquals(tables.RoutingDecision.length, 1, "must not duplicate decision");
});

Deno.test("new route creates one reusable Collection and remains idempotent", async () => {
  const { base44, tables } = fakeBase44({ Clip: [clip()] });
  const propose = async () => ({
    outcome: "new",
    collection_name: "Products",
    collection_description: "Products being compared",
    schema: PRODUCT_SCHEMA,
    fields: { title: "Travel charger", price: 39 },
    confidence: 0.95,
    reason_codes: ["no_equivalent_collection"],
  });

  const first = await processStoredClip(base44, "clip-1", propose);
  const retry = await processStoredClip(base44, "clip-1", propose);

  assertEquals(first.decision.outcome, "new", "expected new decision");
  assertEquals(tables.Collection.length, 1, "expected one Collection");
  assertEquals(tables.Record.length, 1, "expected one Record");
  assertEquals(tables.RoutingDecision.length, 1, "expected one decision");
  assertEquals(tables.Clip[0].routing_status, "created_collection", "expected creation status");
  assertEquals(retry.collection.id, first.collection.id, "retry must return same Collection");
});

Deno.test("review persists audit only and creates no Collection or Record", async () => {
  const { base44, tables } = fakeBase44({ Clip: [clip()] });

  const result = await processStoredClip(base44, "clip-1", async () => ({
    outcome: "review",
    collection_name: "Cameras",
    schema: [
      { name: "title", label: "Model", type: "string" },
      { name: "specifications", label: "Specifications", type: "object" },
    ],
    confidence: 0.41,
    reason_codes: ["ambiguous_candidates"],
  }));

  assertEquals(result.decision.outcome, "review", "expected review decision");
  assertEquals(tables.Collection.length, 0, "review must not create Collection");
  assertEquals(tables.Record.length, 0, "review must not create Record");
  assertEquals(tables.Clip[0].routing_status, "needs_review", "expected review status");
  assertEquals(result.decision.suggested_name, "Cameras", "expected bounded audit name");
  assertEquals(JSON.parse(result.decision.suggested_schema_json), [
    { name: "title", label: "Model", type: "string" },
    { name: "specifications", label: "Specifications", type: "object" },
  ], "expected bounded schema metadata without field values");
});

Deno.test("AI outage enters review instead of creating Saved clips", async () => {
  const { base44, tables } = fakeBase44({ Clip: [clip()] });

  const result = await processStoredClip(base44, "clip-1", async () => {
    throw new Error("gateway unavailable");
  });

  assertEquals(result.decision.outcome, "review", "AI outage must be review");
  assertEquals(JSON.parse(result.decision.reason_codes_json), ["ai_unavailable"], "expected stable reason");
  assertEquals(tables.Collection.length, 0, "outage must not fabricate a Collection");
  assertEquals(tables.Record.length, 0, "outage must not fabricate a Record");
});

Deno.test("no Mission hint stays global and does not select latest active Mission", async () => {
  const { base44, tables } = fakeBase44({
    Clip: [clip()],
    Mission: [{
      id: "mission-latest",
      owner_id: "owner-1",
      title: "Latest active mission",
      status: "active",
    }],
  });
  let receivedMission: unknown = "not-called";

  await processStoredClip(base44, "clip-1", async (_base44, context) => {
    receivedMission = context.mission;
    return {
      outcome: "new",
      collection_name: "Products",
      schema: PRODUCT_SCHEMA,
      fields: { title: "Travel charger", price: 39 },
      confidence: 0.95,
      reason_codes: ["no_equivalent_collection"],
    };
  });

  assertEquals(receivedMission, null, "unscoped capture must have no Mission");
  assert(!tables.Collection[0].mission_id, "new Collection must be global");
  assert(!tables.Record[0].mission_id, "new Record must be global");
  assert(!tables.Clip[0].mission_id, "Clip must stay unscoped");
});

Deno.test("clear camera Project proposal scopes every durable organization row", async () => {
  const { base44, tables } = fakeBase44({
    Clip: [clip({
      source_url: "https://camera.example/nikon-d500",
      raw_text: "Nikon D500 DSLR camera body",
    })],
    Mission: [
      {
        id: "project-camera",
        owner_id: "owner-1",
        title: "Buying a new camera",
        goal: "Compare camera bodies",
        status: "active",
      },
      {
        id: "project-travel",
        owner_id: "owner-1",
        title: "Trip to Japan",
        status: "active",
      },
    ],
  });

  const result = await processStoredClip(base44, "clip-1", async () => ({
    project_assignment: "project",
    project_id: "project-camera",
    project_confidence: 0.97,
    project_candidates: [
      { project_id: "project-camera", score: 0.97 },
      { project_id: "project-travel", score: 0.12 },
    ],
    outcome: "new",
    collection_name: "Cameras",
    collection_description: "Cameras being compared",
    schema: [
      { name: "model", label: "Model", type: "string" },
      { name: "camera_type", label: "Camera type", type: "string" },
    ],
    fields: { model: "Nikon D500", camera_type: "DSLR" },
    confidence: 0.96,
    reason_codes: ["no_equivalent_collection"],
  }));

  assertEquals(result.decision.outcome, "new", "expected routed camera");
  assertEquals(tables.Collection[0].mission_id, "project-camera", "Collection must be Project-scoped");
  assertEquals(tables.Record[0].mission_id, "project-camera", "Record must be Project-scoped");
  assertEquals(tables.Clip[0].mission_id, "project-camera", "Clip must retain assigned Project");
  assertEquals(tables.RoutingDecision[0].mission_id, "project-camera", "decision must audit Project");
  assertEquals(tables.RoutingDecision[0].project_assignment, "agent", "expected agent assignment audit");
  assertEquals(
    JSON.parse(tables.RoutingDecision[0].project_reason_codes_json),
    ["auto_project_match"],
    "expected bounded Project reason",
  );
});

Deno.test("ambiguous Project proposal enters review without organization writes", async () => {
  const { base44, tables } = fakeBase44({
    Clip: [clip()],
    Mission: [
      { id: "project-a", owner_id: "owner-1", title: "Camera A", status: "active" },
      { id: "project-b", owner_id: "owner-1", title: "Camera B", status: "active" },
    ],
  });

  const result = await processStoredClip(base44, "clip-1", async () => ({
    project_assignment: "project",
    project_id: "project-a",
    project_confidence: 0.95,
    project_candidates: [
      { project_id: "project-a", score: 0.95 },
      { project_id: "project-b", score: 0.87 },
    ],
    outcome: "new",
    collection_name: "Products",
    schema: PRODUCT_SCHEMA,
    fields: { title: "Travel charger", price: 39 },
    confidence: 0.95,
    reason_codes: ["no_equivalent_collection"],
  }));

  assertEquals(result.decision.outcome, "review", "ambiguous Project must enter review");
  assertEquals(tables.Collection.length, 0, "must not create Collection");
  assertEquals(tables.Record.length, 0, "must not create Record");
  assertEquals(tables.Clip[0].routing_reason_code, "ambiguous_candidates", "expected safe review reason");
  assertEquals(tables.RoutingDecision[0].project_assignment, "review", "expected review audit");
});

Deno.test("partial Record recovery creates the missing decision without another Record", async () => {
  const { base44, tables } = fakeBase44({
    Clip: [clip({ status: "processing" })],
    Collection: [collection()],
    Record: [{
      id: "record-partial",
      owner_id: "owner-1",
      collection_id: "collection-products",
      clip_id: "clip-1",
      fields_json: JSON.stringify({ title: "Travel charger", price: 39 }),
      source_url: "https://shop.example/item",
      confidence: 0.92,
    }],
  });
  let proposed = false;

  const result = await processStoredClip(base44, "clip-1", async () => {
    proposed = true;
    return existingProposal();
  });

  assert(!proposed, "partial recovery must not call the model");
  assertEquals(result.record.id, "record-partial", "expected original Record");
  assertEquals(tables.Record.length, 1, "must not duplicate the partial Record");
  assertEquals(tables.RoutingDecision.length, 1, "expected recovered decision");
  assertEquals(tables.Clip[0].routing_status, "routed_existing", "expected completed Clip");
});

Deno.test("Hebrew camera capture persists a localized Collection and normalized price", async () => {
  const { base44, tables } = fakeBase44({
    Clip: [clip({
      source_url: "https://camera.example.co.il/sony-a7",
      raw_text: "מצלמת Sony Alpha 7 IV מחיר 8,499 ₪",
      mission_id: "mission-cameras",
    })],
    Mission: [{
      id: "mission-cameras",
      owner_id: "owner-1",
      title: "מצלמות",
      status: "active",
    }],
  });

  const result = await processStoredClip(base44, "clip-1", async () => ({
    outcome: "new",
    collection_name: "מצלמות",
    collection_description: "מצלמות להשוואה",
    schema: [
      { name: "title", label: "דגם", type: "string" },
      { name: "price", label: "מחיר", type: "currency" },
      { name: "specifications", label: "מפרט", type: "object" },
    ],
    fields: {
      title: "Sony Alpha 7 IV",
      price: "\u200f8,499\u00a0₪",
      specifications: { sensor: "full frame" },
    },
    confidence: 0.93,
    reason_codes: ["no_equivalent_collection"],
  }));

  assertEquals(result.decision.outcome, "new", "expected a validated new route");
  assertEquals(tables.Collection[0].name, "מצלמות", "expected localized Collection name");
  assertEquals(JSON.parse(tables.Collection[0].schema_json), [
    { name: "title", label: "דגם", type: "string" },
    { name: "price", label: "מחיר", type: "number" },
  ], "expected unsupported schema fields to be dropped");
  assertEquals(
    JSON.parse(tables.Record[0].fields_json),
    { title: "Sony Alpha 7 IV", price: 8499 },
    "expected durable normalized fields",
  );
});

Deno.test("a hosted not-found throw from Clip.get maps to 404, not 500", async () => {
  const { base44 } = fakeBase44();
  base44.asServiceRole.entities.Clip.get = async (id: string) => {
    throw new Error(`Entity Clip with ID ${id} not found`);
  };

  try {
    await processStoredClip(base44, "missing-clip", async () => existingProposal());
    throw new Error("expected an HttpError");
  } catch (error) {
    const status = (error as { status?: number }).status;
    if (status !== 404) throw new Error(`expected 404, got ${status}: ${error}`);
  }
});
