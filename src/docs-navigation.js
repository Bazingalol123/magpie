export function parseDocsLocation(location) {
  const url = new URL(location, "https://magpie.local");
  return {
    slug: url.searchParams.get("docs") || "getting-started",
    hash: url.hash.replace(/^#/, "") || null,
  };
}
