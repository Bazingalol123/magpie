import { assert } from "jsr:@std/assert@1";

const root = new URL("../", import.meta.url);

Deno.test("the SPA strips a leaked /api/apps/auth/* URL back to a clean route instead of leaving it in the address bar", async () => {
  const app = await Deno.readTextFile(new URL("src/App.jsx", root));
  assert(
    app.includes('window.location.pathname.startsWith("/api/")'),
    "App.jsx must detect a stray Base44 /api/* path (e.g. /api/apps/auth/final-callback) left in the browser URL",
  );
  assert(
    /window\.location\.pathname\.startsWith\("\/api\/"\)\)\s*return;\s*window\.history\.replaceState\(null, "", "\/"\);/.test(app),
    "a leaked /api/* path must be replaced with a clean root URL via history.replaceState, not left showing the raw auth callback",
  );
});
