import { assert } from "jsr:@std/assert@1";

Deno.test("production Base44 client uses the app API host when no local URL is injected", async () => {
  const source = await Deno.readTextFile(new URL("../src/api/base44Client.js", import.meta.url));
  assert(source.includes("const base44BaseUrl = localBaseUrl || 'https://app.base44.com';"));
  assert(source.includes("serverUrl: base44BaseUrl"));
  assert(source.includes("appBaseUrl: base44BaseUrl"));
});
