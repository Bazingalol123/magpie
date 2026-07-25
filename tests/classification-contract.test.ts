import { adaptRoutingProposal, routingUserContent } from "../base44/shared/classification.ts";
import { routeCapture } from "../base44/shared/routing.ts";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function assertEquals(actual: unknown, expected: unknown, message: string) {
  const left = JSON.stringify(actual);
  const right = JSON.stringify(expected);
  if (left !== right) throw new Error(`${message}\nexpected: ${right}\nactual:   ${left}`);
}

Deno.test("structured camera contract adapts into a validated new route", () => {
  const adapted = adaptRoutingProposal(JSON.stringify({
    outcome: "new",
    existing_collection_id: null,
    collection_name: "מצלמות",
    collection_description: "מצלמות להשוואה",
    schema_fields: [
      { name: "model", label: "דגם", type: "string" },
      { name: "camera_type", label: "סוג מצלמה", type: "string" },
    ],
    record_fields: [
      { name: "model", value: "Nikon D500" },
      { name: "camera_type", value: "DSLR" },
    ],
    confidence: 0.9,
    reason_codes: ["no_equivalent_collection"],
  }));
  const result = routeCapture({
    ownerId: "owner-1",
    missionId: "mission-camera",
    collections: [],
    proposal: adapted,
  });

  assert(result.outcome === "new", "the exact camera scenario must create a Collection");
  assertEquals(result.fields, { model: "Nikon D500", camera_type: "DSLR" }, "expected extracted camera values");
});

Deno.test("JSON Schema object proposals adapt to the canonical routing schema", () => {
  const adapted = adaptRoutingProposal({
    outcome: "new",
    collection_name: "Cameras",
    collection_description: "Cameras being compared",
    schema: {
      type: "object",
      properties: {
        model: { type: "string", title: "Model" },
        price: { type: "currency", title: "Price" },
      },
    },
    fields: { model: "Nikon D500", price: "₪8,499" },
    confidence: 0.91,
    reason_codes: ["no_equivalent_collection"],
  });
  const result = routeCapture({
    ownerId: "owner-1",
    collections: [],
    proposal: adapted,
  });

  assert(result.outcome === "new", "common JSON Schema output should be adapted safely");
  assertEquals(result.fields, { model: "Nikon D500", price: 8499 }, "expected canonical values");
});

Deno.test("observed swapped schema/fields output remains review instead of polluting data", () => {
  const adapted = adaptRoutingProposal({
    outcome: "new",
    collection_name: "מצלמות",
    schema: "camera_inventory",
    fields: [
      { name: "model_name", label: "שם דגם", type: "string" },
      { name: "camera_type", label: "סוג מצלמה", type: "string" },
    ],
    confidence: 0.9,
    reason_codes: ["no_equivalent_collection"],
  });
  const result = routeCapture({
    ownerId: "owner-1",
    collections: [],
    proposal: adapted,
  });

  assertEquals(result.outcome, "review", "definitions without actual values must not create a Record");
  assert(result.reason_codes.includes("insufficient_supported_fields"), "expected the precise missing-values reason");
});

Deno.test("structured string booleans normalize against boolean schema fields", () => {
  const adapted = adaptRoutingProposal({
    outcome: "new",
    collection_name: "Cameras",
    schema_fields: [
      { name: "model", label: "Model", type: "string" },
      { name: "body_only", label: "Body only", type: "boolean" },
    ],
    record_fields: [
      { name: "model", value: "Nikon D500" },
      { name: "body_only", value: "כן" },
    ],
    confidence: 0.9,
    reason_codes: ["no_equivalent_collection"],
  });
  const result = routeCapture({
    ownerId: "owner-1",
    collections: [],
    proposal: adapted,
  });

  assert(result.outcome === "new", "boolean strings from the structured contract should remain supported");
  assertEquals(result.fields.body_only, true, "expected Hebrew boolean normalization");
});

Deno.test("visual captures attach uploaded screenshot evidence to routing", () => {
  const content = routingUserContent({
    clip: {
      source_url: "https://example.com/camera",
      capture_mode: "visual",
      raw_text: "Visual capture",
      screenshot_id: "https://cdn.example.com/camera-crop.jpg",
    },
    collections: [],
  });

  assert(Array.isArray(content), "visual capture should use multimodal message content");
  assertEquals(content[1], {
    type: "image_url",
    image_url: { url: "https://cdn.example.com/camera-crop.jpg" },
  }, "expected uploaded crop as image evidence");
});

Deno.test("non-visual captures do not attach stored screenshots to routing", () => {
  const content = routingUserContent({
    clip: {
      source_url: "https://example.com/camera",
      capture_mode: "element",
      raw_text: "Nikon D500 DSLR",
      screenshot_id: "https://cdn.example.com/full-page.jpg",
    },
    collections: [],
  });

  assert(typeof content === "string", "element capture should remain text-only for bounded cost and privacy");
});
