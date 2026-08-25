export function isDocsRoute(location) {
  const url = new URL(location, "https://magpie.local");
  return url.pathname === "/docs" || url.pathname.startsWith("/docs/") || url.searchParams.has("docs");
}

export function parseDocsLocation(location) {
  const url = new URL(location, "https://magpie.local");
  const pathSlug = url.pathname.startsWith("/docs/") ? url.pathname.slice("/docs/".length).replace(/\/$/, "") : "";
  return {
    slug: pathSlug || url.searchParams.get("docs") || "getting-started",
    hash: url.hash.replace(/^#/, "") || null,
  };
}
