import { assert } from "jsr:@std/assert@1";

Deno.test("production Base44 client uses the app API host when no local URL is injected", async () => {
  const source = await Deno.readTextFile(new URL("../src/api/base44Client.js", import.meta.url));
  assert(source.includes("const base44ServerUrl = localBaseUrl || 'https://app.base44.com';"));
  assert(source.includes("const appBaseUrl = localBaseUrl ||"));
  assert(source.includes("serverUrl: base44ServerUrl"));
  assert(source.includes("appBaseUrl,"));
  const app = await Deno.readTextFile(new URL("../src/App.jsx", import.meta.url));
  assert(app.includes("base44.auth.redirectToLogin(window.location.href)"));
  assert(app.includes("base44.auth.redirectToLogin(shareRedirectPath)"));
  assert(!app.includes("import LoginPage from \"./LoginPage.jsx\""));
});
