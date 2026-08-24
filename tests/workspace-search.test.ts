import { assert, assertEquals } from "jsr:@std/assert";
import { parseNumericConstraint, searchWorkspace } from "../src/workspace-search.js";

Deno.test("workspace search parses human numeric constraints", () => {
  assertEquals(parseNumericConstraint("cars under 70k"), { operator: "lte", amount: 70000, source: "under 70k", start: 5 });
  assertEquals(parseNumericConstraint("rent at least €1,250")?.amount, 1250);
});

Deno.test("workspace search names the field that satisfied a typed constraint", () => {
  const result = searchWorkspace({
    query: "under 70k",
    records: [{ id: "r1", clip_id: "c1", collection_id: "col1", source_url: "https://cars.example/a", fields_json: JSON.stringify({ title: "Mazda CX-5", price: "₪68,000" }) }],
    clips: [{ id: "c1", raw_text: "A clean crossover" }],
    collections: [{ id: "col1", name: "Vehicle Listings" }],
  });
  assertEquals(result.items.length, 1);
  assertEquals(result.items[0].matchedField, "price");
});

Deno.test("workspace search distinguishes captured-text and field matches", () => {
  const data = {
    records: [{ id: "r1", clip_id: "c1", collection_id: "col1", source_url: "https://example.com/a", fields_json: JSON.stringify({ title: "Quiet camera" }) }],
    clips: [{ id: "c1", raw_text: "Includes a weather-sealed body" }],
    collections: [{ id: "col1", name: "Cameras" }],
  };
  assertEquals(searchWorkspace({ query: "camera", ...data }).items[0].matchedField, "title");
  const body = searchWorkspace({ query: "weather-sealed", ...data }).items[0];
  assert(body.matchKind === "capture");
  assertEquals(body.matchedField, "captured text");
});
