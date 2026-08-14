import { assertEquals } from "jsr:@std/assert";
import { parseDocsLocation } from "../src/docs-navigation.js";

Deno.test("preserves the document fragment for a direct docs deep link", () => {
  assertEquals(
    parseDocsLocation("?docs=product-guide#trust-model"),
    { slug: "product-guide", hash: "trust-model" },
  );
});
