import { assert } from "jsr:@std/assert@1";

Deno.test("scheduled sweep runner unwraps and validates the Base44 function response", async () => {
  const source = await Deno.readTextFile(new URL("../scripts/run-sweep-watches.mjs", import.meta.url));

  assert(source.includes("const result = response?.data;"));
  assert(source.includes('typeof result.processed !== "number"'));
  assert(source.includes("!Array.isArray(result.results)"));
  assert(!source.includes("const result = await withTimeout("));
});
