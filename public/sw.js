const CACHE = "magpie-shell-v2";
const SHARE_CACHE = "magpie-share-inbox-v1";
const SHELL = ["/", "/manifest.webmanifest", "/magpie-mark-192.png", "/magpie-mark-512.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("message", (event) => {
  if (event.data?.type !== "consume_share" || !event.data.id) return;
  event.waitUntil(caches.open(SHARE_CACHE).then((cache) => cache.delete(new Request(`/__magpie_share/${event.data.id}`))));
});

self.addEventListener("fetch", (event) => {
  const requestUrl = new URL(event.request.url);
  if (requestUrl.pathname.startsWith("/__magpie_share/")) {
    event.respondWith(caches.open(SHARE_CACHE).then((cache) => cache.match(event.request)));
    return;
  }
  if (event.request.method === "POST" && requestUrl.pathname === "/share") {
    event.respondWith(storeShareAndRedirect(event.request));
    return;
  }
  if (event.request.method !== "GET") return;
  event.respondWith(fetchWithNavigationFallback(event.request));
});

async function fetchWithNavigationFallback(request) {
  try {
    const response = await fetch(request);
    if (response.ok || request.mode !== "navigate") return response;
    return (await caches.match("/")) || response;
  } catch {
    return (await caches.match(request)) || (await caches.match("/"));
  }
}

async function storeShareAndRedirect(request) {
  const form = await request.formData();
  const id = crypto.randomUUID();
  const payload = {
    title: String(form.get("title") || ""),
    text: String(form.get("text") || ""),
    url: String(form.get("url") || ""),
  };
  const cache = await caches.open(SHARE_CACHE);
  await cache.put(
    new Request(`/__magpie_share/${id}`),
    new Response(JSON.stringify(payload), { headers: { "Content-Type": "application/json" } }),
  );
  return Response.redirect(`/share?share_id=${encodeURIComponent(id)}`, 303);
}
