function parseJson(value, fallback) {
  try {
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
}

export function hostFromSearchUrl(value) {
  try {
    return new URL(value).hostname.replace(/^www\./, "");
  } catch {
    return "source page";
  }
}

function scalarText(value) {
  if (value === null || value === undefined) return "";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function numericValue(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const match = scalarText(value).replace(/,/g, "").match(/-?\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : null;
}

export function parseNumericConstraint(query) {
  const normalized = String(query || "").trim();
  const match = normalized.match(/\b(under|below|less\s+than|at\s+most|max(?:imum)?|over|above|more\s+than|at\s+least|min(?:imum)?)\s*[:=]?\s*[₪$€£]?\s*(\d[\d,.]*)\s*([km])?\b/i);
  if (!match) return null;
  let amount = Number(match[2].replace(/,/g, ""));
  if (!Number.isFinite(amount)) return null;
  if (match[3]?.toLowerCase() === "k") amount *= 1_000;
  if (match[3]?.toLowerCase() === "m") amount *= 1_000_000;
  const word = match[1].toLowerCase().replace(/\s+/g, " ");
  const operator = ["under", "below", "less than", "at most", "max", "maximum"].includes(word) ? "lte" : "gte";
  return { operator, amount, source: match[0], start: match.index ?? 0 };
}

function textTerms(query, constraint) {
  const withoutConstraint = constraint ? query.replace(constraint.source, " ") : query;
  return withoutConstraint
    .toLowerCase()
    .split(/\s+/)
    .map((term) => term.trim())
    .filter((term) => term.length > 1);
}

function constraintMatches(value, constraint) {
  const number = numericValue(value);
  if (number === null) return false;
  return constraint.operator === "lte" ? number <= constraint.amount : number >= constraint.amount;
}

function isConstraintField(candidate) {
  return candidate.kind === "field" && !/^(title|name|product|role|description|summary|source|url)$/i.test(candidate.field);
}

export function searchWorkspace({ query, records, clips, collections }) {
  const cleanQuery = String(query || "").trim();
  if (!cleanQuery) return { items: [], collections: [], constraint: null };

  const constraint = parseNumericConstraint(cleanQuery);
  const terms = textTerms(cleanQuery, constraint);
  const clipsById = new Map(clips.map((clip) => [clip.id, clip]));
  const collectionsById = new Map(collections.map((collection) => [collection.id, collection]));

  const items = records.flatMap((record) => {
    const fields = parseJson(record.fields_json, {});
    const clip = clipsById.get(record.clip_id);
    const collection = collectionsById.get(record.collection_id);
    const host = hostFromSearchUrl(record.source_url);
    const candidates = [
      ...Object.entries(fields).map(([field, value]) => ({ field, value: scalarText(value), raw: value, kind: "field" })),
      { field: "captured text", value: scalarText(clip?.raw_text), raw: clip?.raw_text, kind: "capture" },
      { field: "source", value: host, raw: host, kind: "source" },
    ];

    const numericHits = constraint ? candidates.filter((candidate) => isConstraintField(candidate) && constraintMatches(candidate.raw, constraint)) : [];
    if (constraint && !numericHits.length) return [];

    const termHits = terms.flatMap((term) => candidates.filter((candidate) => candidate.value.toLowerCase().includes(term)));
    if (terms.length && !terms.every((term) => candidates.some((candidate) => candidate.value.toLowerCase().includes(term)))) return [];

    const bestHit = numericHits[0] || termHits.find((candidate) => candidate.kind === "field") || termHits[0] || candidates[0];
    const title = scalarText(fields.title || fields.name || fields.product || fields.role || Object.values(fields).find(Boolean) || host);
    return [{
      id: record.id,
      record,
      title,
      collectionName: collection?.name || "Collection",
      matchedField: bestHit.field,
      matchedValue: bestHit.value,
      matchKind: bestHit.kind,
      host,
    }];
  });

  const collectionResults = collections
    .filter((collection) => terms.length > 0 && terms.every((term) => `${collection.name} ${collection.description || ""}`.toLowerCase().includes(term)))
    .map((collection) => ({ id: collection.id, collection, title: collection.name, description: collection.description || "Structured Collection" }));

  return { items, collections: collectionResults, constraint };
}
