import {
  routeCapture,
  type RoutingCollection,
  type RoutingField,
} from "../base44/shared/routing.ts";

const PRODUCT_SCHEMA: RoutingField[] = [
  { name: "title", label: "Title", type: "string" },
  { name: "price", label: "Price", type: "number" },
];

const APARTMENT_SCHEMA: RoutingField[] = [
  { name: "title", label: "Listing", type: "string" },
  { name: "rent", label: "Rent", type: "number" },
];

function collection(overrides: Partial<RoutingCollection> = {}): RoutingCollection {
  return {
    id: "collection-products",
    owner_id: "owner-1",
    name: "Products",
    status: "active",
    schema: PRODUCT_SCHEMA,
    ...overrides,
  };
}

function proposal(overrides: Record<string, unknown> = {}) {
  return {
    outcome: "existing",
    existing_collection_id: "collection-products",
    collection_name: "Products",
    collection_description: "Products being compared",
    schema: PRODUCT_SCHEMA,
    fields: { title: "Travel charger", price: 39 },
    confidence: 0.93,
    reason_codes: ["existing_schema_match"],
    ...overrides,
  };
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function assertEquals(actual: unknown, expected: unknown, message: string) {
  const actualJson = JSON.stringify(actual);
  const expectedJson = JSON.stringify(expected);
  if (actualJson !== expectedJson) {
    throw new Error(`${message}\nexpected: ${expectedJson}\nactual:   ${actualJson}`);
  }
}

Deno.test("clear existing Collection returns a validated existing route", () => {
  const result = routeCapture({
    ownerId: "owner-1",
    collections: [collection()],
    proposal: proposal(),
  });

  assert(result.outcome === "existing", "expected existing route");
  assertEquals(result.collection_id, "collection-products", "expected selected Collection");
  assertEquals(result.fields, { title: "Travel charger", price: 39 }, "expected schema-bounded fields");
});

Deno.test("genuinely new object type returns a bounded new route", () => {
  const result = routeCapture({
    ownerId: "owner-1",
    collections: [collection()],
    proposal: proposal({
      outcome: "new",
      existing_collection_id: undefined,
      collection_name: "Recipes",
      collection_description: "Reusable cooking recipes",
      schema: [
        { name: "title", label: "Recipe", type: "string" },
        { name: "cook_time", label: "Cook time", type: "string" },
      ],
      fields: { title: "Tomato pasta", cook_time: "25 minutes", invented: "drop me" },
      confidence: 0.91,
      reason_codes: ["no_equivalent_collection", "model_internal_code"],
    }),
  });

  assert(result.outcome === "new", "expected new route");
  assertEquals(result.collection_name, "Recipes", "expected stable plural name");
  assertEquals(result.fields, { title: "Tomato pasta", cook_time: "25 minutes" }, "expected unknown fields dropped");
  assert(!result.reason_codes.includes("model_internal_code" as never), "unknown reason code must be dropped");
});

Deno.test("ambiguous proposal returns review with no mutation target", () => {
  const result = routeCapture({
    ownerId: "owner-1",
    collections: [collection()],
    proposal: proposal({
      outcome: "review",
      reason_codes: ["ambiguous_candidates"],
    }),
  });

  assertEquals(result.outcome, "review", "expected review");
  assert(!("collection_id" in result), "review must not select a Collection");
  assert(!("fields" in result), "review must not carry a Record mutation");
});

Deno.test("malformed AI response returns review", () => {
  const result = routeCapture({
    ownerId: "owner-1",
    collections: [collection()],
    proposal: "not json",
  });

  assertEquals(result, {
    outcome: "review",
    confidence: 0,
    reason_codes: ["malformed_ai_response"],
  }, "malformed output must be review");
});

Deno.test("cross-owner Collection ID is rejected", () => {
  const result = routeCapture({
    ownerId: "owner-1",
    collections: [collection({ id: "collection-other", owner_id: "owner-2" })],
    proposal: proposal({ existing_collection_id: "collection-other" }),
  });

  assertEquals(result.outcome, "review", "cross-owner target must be review");
  assert(result.reason_codes.includes("cross_owner_candidate"), "expected stable cross-owner reason");
});

Deno.test("a saved-search Collection is never eligible for capture routing", () => {
  const result = routeCapture({
    ownerId: "owner-1",
    collections: [collection({ collection_type: "saved_search" })],
    proposal: proposal(),
  });
  assertEquals(result.outcome, "review", "saved searches are views, not routing destinations");
  assert(result.reason_codes.includes("ineligible_scope"), "expected an ineligible target reason");
});

Deno.test("synonym name reuses an eligible Collection alias", () => {
  const result = routeCapture({
    ownerId: "owner-1",
    collections: [
      collection({
        id: "collection-apartments",
        name: "Apartments",
        schema: APARTMENT_SCHEMA,
        routing_profile_json: JSON.stringify({ aliases: ["Flats"] }),
      }),
    ],
    proposal: proposal({
      outcome: "new",
      existing_collection_id: undefined,
      collection_name: "Flats",
      schema: APARTMENT_SCHEMA,
      fields: { title: "Sunny two-bedroom", rent: 1800 },
      confidence: 0.9,
      reason_codes: ["no_equivalent_collection"],
    }),
  });

  assert(result.outcome === "existing", "synonym must reuse existing Collection");
  assertEquals(result.collection_id, "collection-apartments", "expected aliased Collection");
  assert(result.reason_codes.includes("equivalent_collection"), "expected equivalence reason");
});

Deno.test("equivalent schema prevents a duplicate synonym Collection", () => {
  const result = routeCapture({
    ownerId: "owner-1",
    collections: [
      collection({
        id: "collection-apartments",
        name: "Apartments",
        schema: APARTMENT_SCHEMA,
      }),
    ],
    proposal: proposal({
      outcome: "new",
      existing_collection_id: undefined,
      collection_name: "Rental homes",
      schema: APARTMENT_SCHEMA,
      fields: { title: "Courtyard flat", rent: 1700 },
      confidence: 0.92,
    }),
  });

  assert(result.outcome === "existing", "equivalent schema must reuse existing Collection");
  assertEquals(result.collection_id, "collection-apartments", "expected schema-equivalent Collection");
});

Deno.test("Mission-scoped equivalent wins over a global Collection", () => {
  const result = routeCapture({
    ownerId: "owner-1",
    missionId: "mission-berlin",
    collections: [
      collection({ id: "apartments-global", name: "Apartments", schema: APARTMENT_SCHEMA }),
      collection({
        id: "apartments-berlin",
        mission_id: "mission-berlin",
        name: "Apartments",
        schema: APARTMENT_SCHEMA,
      }),
    ],
    proposal: proposal({
      outcome: "new",
      existing_collection_id: undefined,
      collection_name: "Apartments",
      schema: APARTMENT_SCHEMA,
      fields: { title: "Kreuzberg apartment", rent: 2100 },
      confidence: 0.94,
    }),
  });

  assert(result.outcome === "existing", "expected existing Collection");
  assertEquals(result.collection_id, "apartments-berlin", "Mission scope must win");
  assert(result.reason_codes.includes("mission_scope_match"), "expected Mission scope reason");
});

Deno.test("without a Mission hint, Mission-scoped Collections are ineligible", () => {
  const result = routeCapture({
    ownerId: "owner-1",
    collections: [
      collection({
        id: "apartments-berlin",
        mission_id: "mission-berlin",
        name: "Apartments",
        schema: APARTMENT_SCHEMA,
      }),
      collection({ id: "apartments-global", name: "Apartments", schema: APARTMENT_SCHEMA }),
    ],
    proposal: proposal({
      outcome: "new",
      existing_collection_id: undefined,
      collection_name: "Apartments",
      schema: APARTMENT_SCHEMA,
      fields: { title: "Canal apartment", rent: 1900 },
      confidence: 0.94,
    }),
  });

  assert(result.outcome === "existing", "expected global existing Collection");
  assertEquals(result.collection_id, "apartments-global", "Mission Collection must be excluded");
  assert(result.reason_codes.includes("global_scope_match"), "expected global scope reason");
});

Deno.test("an explicitly selected Collection from another Mission is rejected", () => {
  const result = routeCapture({
    ownerId: "owner-1",
    missionId: "mission-berlin",
    collections: [
      collection({
        id: "apartments-paris",
        mission_id: "mission-paris",
        name: "Apartments",
        schema: APARTMENT_SCHEMA,
      }),
    ],
    proposal: proposal({
      existing_collection_id: "apartments-paris",
      schema: APARTMENT_SCHEMA,
      fields: { title: "Berlin apartment", rent: 1900 },
    }),
  });

  assertEquals(result.outcome, "review", "cross-Mission target must be review");
  assert(result.reason_codes.includes("ineligible_scope"), "expected stable scope reason");
});

Deno.test("mixed-content fragment returns review even when model proposes new", () => {
  const result = routeCapture({
    ownerId: "owner-1",
    collections: [],
    proposal: proposal({
      outcome: "new",
      existing_collection_id: undefined,
      collection_name: "Listings",
      reason_codes: ["mixed_content"],
    }),
  });

  assertEquals(result.outcome, "review", "mixed content must be review");
  assert(result.reason_codes.includes("mixed_content"), "expected mixed-content reason");
});

Deno.test("AI outage returns review and never Saved clips", () => {
  const result = routeCapture({
    ownerId: "owner-1",
    collections: [],
    aiError: true,
  });

  assertEquals(result, {
    outcome: "review",
    confidence: 0,
    reason_codes: ["ai_unavailable"],
  }, "AI outage must be review");
  assert(!("collection_name" in result), "AI outage must not propose fallback Collection creation");
});

for (const unsafeName of ["Saved clips", "Mission · Move to Berlin", "example.com listings"]) {
  Deno.test(`unsafe Collection name '${unsafeName}' returns review`, () => {
    const result = routeCapture({
      ownerId: "owner-1",
      collections: [],
      proposal: proposal({
        outcome: "new",
        existing_collection_id: undefined,
        collection_name: unsafeName,
        schema: APARTMENT_SCHEMA,
        fields: { title: "Sunny apartment", rent: 1800 },
        confidence: 0.95,
        reason_codes: [],
      }),
    });

    assertEquals(result.outcome, "review", "unsafe name must not create a Collection");
    assert(result.reason_codes.includes("unsafe_collection_name"), "expected precise name rejection reason");
  });
}

Deno.test("low confidence cannot create a Collection", () => {
  const result = routeCapture({
    ownerId: "owner-1",
    collections: [],
    proposal: proposal({
      outcome: "new",
      existing_collection_id: undefined,
      collection_name: "Recipes",
      schema: [
        { name: "title", label: "Recipe", type: "string" },
        { name: "time", label: "Time", type: "string" },
      ],
      fields: { title: "Soup", time: "20 minutes" },
      confidence: 0.45,
      reason_codes: [],
    }),
  });

  assertEquals(result.outcome, "review", "low confidence must be review");
  assert(result.reason_codes.includes("low_confidence"), "expected low-confidence reason");
  assertEquals(result.reason_codes[0], "low_confidence", "the client-safe primary reason must be actionable");
});

Deno.test("new Collection requires at least two supported fields", () => {
  const result = routeCapture({
    ownerId: "owner-1",
    collections: [],
    proposal: proposal({
      outcome: "new",
      existing_collection_id: undefined,
      collection_name: "Recipes",
      schema: [
        { name: "title", label: "Recipe", type: "string" },
        { name: "time", label: "Time", type: "string" },
      ],
      fields: { title: "Soup" },
      confidence: 0.95,
      reason_codes: [],
    }),
  });

  assertEquals(result.outcome, "review", "weakly supported new type must be review");
  assert(result.reason_codes.includes("insufficient_supported_fields"), "expected support reason");
});

Deno.test("a safe Hebrew plural Collection name is accepted", () => {
  const result = routeCapture({
    ownerId: "owner-1",
    missionId: "mission-cameras",
    collections: [],
    proposal: proposal({
      outcome: "new",
      existing_collection_id: undefined,
      collection_name: "מצלמות",
      collection_description: "מצלמות להשוואה",
      schema: [
        { name: "title", label: "דגם", type: "string" },
        { name: "price", label: "מחיר", type: "number" },
      ],
      fields: { title: "Sony Alpha 7 IV", price: 8499 },
      confidence: 0.93,
      reason_codes: ["no_equivalent_collection"],
    }),
  });

  assert(result.outcome === "new", "safe non-Latin names must not require an English plural suffix");
  assertEquals(result.collection_name, "מצלמות", "expected the normalized Hebrew name");
});

Deno.test("formatted shekel prices normalize into numeric schema fields", () => {
  const result = routeCapture({
    ownerId: "owner-1",
    missionId: "mission-cameras",
    collections: [],
    proposal: proposal({
      outcome: "new",
      existing_collection_id: undefined,
      collection_name: "Cameras",
      schema: [
        { name: "title", label: "Model", type: "string" },
        { name: "price", label: "Price", type: "number" },
      ],
      fields: { title: "Sony Alpha 7 IV", price: "\u200f8,499\u00a0₪" },
      confidence: 0.93,
      reason_codes: ["no_equivalent_collection"],
    }),
  });

  assert(result.outcome === "new", "a formatted visible price should remain supported");
  assertEquals(result.fields.price, 8499, "expected currency formatting to be normalized");
});

Deno.test("model structural warning cannot veto an otherwise valid server-validated route", () => {
  const result = routeCapture({
    ownerId: "owner-1",
    missionId: "mission-cameras",
    collections: [],
    proposal: proposal({
      outcome: "new",
      existing_collection_id: undefined,
      collection_name: "מצלמות",
      schema: [
        { name: "title", label: "דגם", type: "string" },
        { name: "price", label: "מחיר", type: "number" },
      ],
      fields: { title: "Canon EOS R6", price: 7299 },
      confidence: 0.92,
      reason_codes: ["unsupported_schema"],
    }),
  });

  assertEquals(result.outcome, "new", "server validation must be authoritative");
  assert(!result.reason_codes.includes("unsupported_schema"), "untrusted structural reason must be dropped");
});

Deno.test("safe AI schema type aliases normalize to canonical entity types", () => {
  const result = routeCapture({
    ownerId: "owner-1",
    collections: [],
    proposal: proposal({
      outcome: "new",
      existing_collection_id: undefined,
      collection_name: "Cameras",
      schema: [
        { name: "title", label: "Model", type: "text" },
        { name: "price", label: "Price", type: "currency" },
        { name: "product_url", label: "Product URL", type: "url" },
      ],
      fields: {
        title: "Canon EOS R6",
        price: "₪7,299",
        product_url: "https://camera.example/canon-r6",
      },
      confidence: 0.92,
      reason_codes: ["no_equivalent_collection"],
    }),
  });

  assert(result.outcome === "new", "safe aliases should not invalidate the whole schema");
  assertEquals(result.schema, [
    { name: "title", label: "Model", type: "string" },
    { name: "price", label: "Price", type: "number" },
    { name: "product_url", label: "Product URL", type: "string" },
  ], "expected canonical schema types");
  assertEquals(result.fields.price, 7299, "expected aliased currency field normalization");
});

Deno.test("truly unsupported nested schema gets a precise invalid-schema reason", () => {
  const result = routeCapture({
    ownerId: "owner-1",
    collections: [],
    proposal: proposal({
      outcome: "new",
      existing_collection_id: undefined,
      collection_name: "Cameras",
      schema: [
        { name: "title", label: "Model", type: "string" },
        { name: "specifications", label: "Specifications", type: "object" },
      ],
      fields: { title: "Canon EOS R6", specifications: { sensor: "full frame" } },
      confidence: 0.92,
      reason_codes: [],
    }),
  });

  assertEquals(result.outcome, "review", "nested schemas remain outside the safe contract");
  assertEquals(result.reason_codes[0], "invalid_schema", "expected precise schema reason");
});

Deno.test("unsupported fields are dropped when two safe Collection fields remain", () => {
  const result = routeCapture({
    ownerId: "owner-1",
    missionId: "mission-cameras",
    collections: [],
    proposal: proposal({
      outcome: "new",
      existing_collection_id: undefined,
      collection_name: "מצלמות",
      schema: [
        { name: "title", label: "דגם", type: "string" },
        { name: "price", label: "מחיר", type: "currency" },
        { name: "specifications", label: "מפרט", type: "object" },
      ],
      fields: {
        title: "Canon EOS R6",
        price: "₪7,299",
        specifications: { sensor: "full frame" },
      },
      confidence: 0.92,
      reason_codes: ["no_equivalent_collection"],
    }),
  });

  assert(result.outcome === "new", "one unsupported field must not poison a safe reusable schema");
  assertEquals(result.schema, [
    { name: "title", label: "דגם", type: "string" },
    { name: "price", label: "מחיר", type: "number" },
  ], "expected only safe canonical fields");
  assertEquals(result.fields, { title: "Canon EOS R6", price: 7299 }, "expected safe extracted values");
});

Deno.test("a schema at the raised 12-field cap is fully accepted", () => {
  const schema: RoutingField[] = Array.from({ length: 12 }, (_, index) => ({
    name: `field_${index}`,
    label: `Field ${index}`,
    type: "string",
  }));
  const fields = Object.fromEntries(schema.map((field) => [field.name, `value-${field.name}`]));

  const result = routeCapture({
    ownerId: "owner-1",
    collections: [],
    proposal: proposal({
      outcome: "new",
      existing_collection_id: undefined,
      collection_name: "Widgets",
      schema,
      fields,
      confidence: 0.92,
      reason_codes: ["no_equivalent_collection"],
    }),
  });

  assert(result.outcome === "new", "a 12-field schema must not be rejected");
  assertEquals(result.schema.length, 12, "expected all 12 fields to survive normalization");
  assertEquals(Object.keys(result.fields).length, 12, "expected all 12 field values to survive normalization");
});

Deno.test("a schema beyond the 12-field cap is truncated, not rejected", () => {
  const schema: RoutingField[] = Array.from({ length: 15 }, (_, index) => ({
    name: `field_${index}`,
    label: `Field ${index}`,
    type: "string",
  }));
  const fields = Object.fromEntries(schema.map((field) => [field.name, `value-${field.name}`]));

  const result = routeCapture({
    ownerId: "owner-1",
    collections: [],
    proposal: proposal({
      outcome: "new",
      existing_collection_id: undefined,
      collection_name: "Widgets",
      schema,
      fields,
      confidence: 0.92,
      reason_codes: ["no_equivalent_collection"],
    }),
  });

  assert(result.outcome === "new", "an oversized schema should truncate rather than send the capture to review");
  assertEquals(result.schema.length, 12, "expected the schema to be capped at 12 fields");
  assertEquals(
    result.schema.map((field) => field.name),
    schema.slice(0, 12).map((field) => field.name),
    "expected the first 12 proposed fields to survive, in order",
  );
});
