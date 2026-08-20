import { assert, assertEquals } from "jsr:@std/assert@1";

const root = new URL("../", import.meta.url);

Deno.test("PWA manifest exposes an authenticated share target", async () => {
  const manifest = JSON.parse(await Deno.readTextFile(new URL("public/manifest.webmanifest", root)));
  assertEquals(manifest.display, "standalone");
  assertEquals(manifest.share_target.action, "/share");
  assertEquals(manifest.share_target.method, "POST");
  assertEquals(manifest.share_target.params.url, "url");
  assertEquals(manifest.share_target.params.text, "text");
  for (const icon of manifest.icons) {
    const bytes = await Deno.readFile(new URL(`public/${icon.src.slice(1)}`, root));
    assert(bytes.length > 0, `PWA icon is missing: ${icon.src}`);
  }
});

Deno.test("PWA shell registers a production service worker", async () => {
  const main = await Deno.readTextFile(new URL("src/main.jsx", root));
  const serviceWorker = await Deno.readTextFile(new URL("public/sw.js", root));
  assert(main.includes("navigator.serviceWorker.register('/sw.js')"));
  assert(serviceWorker.includes("event.request.method === \"POST\""));
  assert(serviceWorker.includes("storeShareAndRedirect"));
  assert(serviceWorker.includes("self.addEventListener(\"fetch\""));
});

Deno.test("share route is wired to the authenticated mobile capture path", async () => {
  const app = await Deno.readTextFile(new URL("src/App.jsx", root));
  assert(app.includes('window.location.pathname === "/share"'));
  assert(app.includes('const shareRedirectPath = shareId ? `/share?share_id=${encodeURIComponent(shareId)}` : "/share";'));
  assert(app.includes("isSafeHttpUrl(draft.url)"));
  assert(app.includes("<ShareCapturePage"));
  assert(app.includes('base44.functions.invoke("mobile-capture"'));
});
