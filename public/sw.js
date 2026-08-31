const CACHE = "magpie-shell-v3";
const SHELL = ["/", "/manifest.webmanifest", "/magpie-mark-192.png", "/magpie-mark-512.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const requestUrl = new URL(event.request.url);
  // Auth (/api/apps/auth/*) and other backend routes are cross-origin
  // redirect chains (OAuth) or API calls, not SPA pages. Never intercept
  // them with the offline shell fallback below, or a fetch() hiccup partway
  // through the redirect chain silently strands the user on the cached "/"
  // shell instead of letting the real login redirect complete.
  if (requestUrl.pathname.startsWith("/api/")) return;
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
