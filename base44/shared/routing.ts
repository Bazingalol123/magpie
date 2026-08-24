export type RoutingField = {
  name: string;
  label: string;
  type: "string" | "number" | "boolean";
};

export type RoutingCollection = {
  id: string;
  owner_id: string;
  mission_id?: string | null;
  name: string;
  status?: "active" | "archived";
  collection_type?: "structured" | "saved_search";
  schema?: unknown;
  schema_json?: unknown;
  normalized_key?: string;
  routing_profile_json?: unknown;
};

export type RoutingInput = {
  ownerId: string;
  missionId?: string;
  collections: RoutingCollection[];
  proposal?: unknown;
  aiError?: boolean;
};

type ReasonCode =
  | "existing_schema_match"
  | "mission_scope_match"
  | "global_scope_match"
  | "no_equivalent_collection"
  | "ambiguous_candidates"
  | "mixed_content"
  | "unsupported_schema"
  | "invalid_schema"
  | "unsafe_collection_name"
  | "malformed_ai_response"
  | "ai_unavailable"
  | "cross_owner_candidate"
  | "ineligible_scope"
  | "inactive_collection"
  | "insufficient_supported_fields"
  | "low_confidence"
  | "equivalent_collection";

type RoutingBase = {
  confidence: number;
  reason_codes: ReasonCode[];
};

export type ExistingRoutingResult = RoutingBase & {
  outcome: "existing";
  collection_id: string;
  schema: RoutingField[];
  fields: Record<string, string | number | boolean>;
};

export type NewRoutingResult = RoutingBase & {
  outcome: "new";
  collection_name: string;
  collection_description?: string;
  normalized_name: string;
  schema_signature: string;
  schema: RoutingField[];
  fields: Record<string, string | number | boolean>;
};

export type ReviewRoutingResult = RoutingBase & {
  outcome: "review";
};

export type RoutingResult = ExistingRoutingResult | NewRoutingResult | ReviewRoutingResult;

type NormalizedProposal = {
  outcome: "existing" | "new" | "review";
  existing_collection_id?: string;
  collection_name?: string;
  collection_description?: string;
  schema: RoutingField[] | null;
  fields: Record<string, unknown>;
  confidence: number;
  reason_codes: ReasonCode[];
};

const REASON_CODES = new Set<ReasonCode>([
  "existing_schema_match",
  "mission_scope_match",
  "global_scope_match",
  "no_equivalent_collection",
  "ambiguous_candidates",
  "mixed_content",
  "unsupported_schema",
  "invalid_schema",
  "unsafe_collection_name",
  "malformed_ai_response",
  "ai_unavailable",
  "cross_owner_candidate",
  "ineligible_scope",
  "inactive_collection",
  "insufficient_supported_fields",
  "low_confidence",
  "equivalent_collection",
]);

const MODEL_BLOCKING_REASONS = new Set<ReasonCode>([
  "ambiguous_candidates",
  "mixed_content",
]);

const MODEL_REASON_CODES = new Set<ReasonCode>([
  "existing_schema_match",
  "mission_scope_match",
  "global_scope_match",
  "no_equivalent_collection",
  "ambiguous_candidates",
  "mixed_content",
]);

const REVIEW_REASON_PRIORITY: ReasonCode[] = [
  "ai_unavailable",
  "malformed_ai_response",
  "cross_owner_candidate",
  "ineligible_scope",
  "inactive_collection",
  "mixed_content",
  "ambiguous_candidates",
  "invalid_schema",
  "unsafe_collection_name",
  "unsupported_schema",
  "insufficient_supported_fields",
  "low_confidence",
];

const EXISTING_CONFIDENCE_FLOOR = 0.7;
const NEW_CONFIDENCE_FLOOR = 0.8;

export function routeCapture(input: RoutingInput): RoutingResult {
  if (input.aiError) return review(0, ["ai_unavailable"]);

  const proposal = normalizeProposal(input.proposal);
  if (!proposal) return review(0, ["malformed_ai_response"]);
  if (proposal.outcome === "review") {
    return review(
      proposal.confidence,
      proposal.reason_codes.length ? proposal.reason_codes : ["ambiguous_candidates"],
    );
  }
  if (proposal.reason_codes.some((code) => MODEL_BLOCKING_REASONS.has(code))) {
    return review(proposal.confidence, proposal.reason_codes);
  }

  return proposal.outcome === "existing"
    ? routeToExisting(input, proposal)
    : routeToNew(input, proposal);
}

export function normalizeCollectionName(value: string) {
  return value
    .normalize("NFKC")
    .trim()
    .replace(/\s+/g, " ")
    .replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "")
    .slice(0, 48);
}

export function collectionNameKey(value: string) {
  return normalizeCollectionName(value)
    .toLocaleLowerCase("en")
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean)
    .map(singularizeToken)
    .join("-");
}

export function schemaSignature(schema: RoutingField[]) {
  return schema
    .map((field) => `${field.name}:${field.type}`)
    .sort()
    .join("|");
}

export function normalizeRoutingSchema(value: unknown, minimum = 1, maximum = 12) {
  return normalizeSchema(value, minimum, maximum);
}

export function normalizeRoutingFields(
  input: Record<string, unknown>,
  schema: RoutingField[],
) {
  return normalizeFields(input, schema);
}

function routeToExisting(input: RoutingInput, proposal: NormalizedProposal): RoutingResult {
  if (!proposal.existing_collection_id) {
    return review(proposal.confidence, [...proposal.reason_codes, "ineligible_scope"]);
  }

  const selected = input.collections.find((collection) => collection.id === proposal.existing_collection_id);
  if (!selected || selected.owner_id !== input.ownerId) {
    return review(proposal.confidence, [...proposal.reason_codes, "cross_owner_candidate"]);
  }
  if (selected.status === "archived") {
    return review(proposal.confidence, [...proposal.reason_codes, "inactive_collection"]);
  }
  if (selected.collection_type === "saved_search") {
    return review(proposal.confidence, [...proposal.reason_codes, "ineligible_scope"]);
  }
  if (scopeRank(selected, input.missionId) === Number.POSITIVE_INFINITY) {
    return review(proposal.confidence, [...proposal.reason_codes, "ineligible_scope"]);
  }

  const schema = normalizeSchema(selected.schema ?? selected.schema_json, 1, 12);
  if (!schema) return review(proposal.confidence, [...proposal.reason_codes, "invalid_schema"]);

  const fields = normalizeFields(proposal.fields, schema);
  if (!Object.keys(fields).length) {
    return review(proposal.confidence, [...proposal.reason_codes, "insufficient_supported_fields"]);
  }
  if (proposal.confidence < EXISTING_CONFIDENCE_FLOOR) {
    return review(proposal.confidence, [...proposal.reason_codes, "low_confidence"]);
  }

  return {
    outcome: "existing",
    collection_id: selected.id,
    schema,
    fields,
    confidence: proposal.confidence,
    reason_codes: reasons(
      proposal.reason_codes,
      "existing_schema_match",
      selected.mission_id ? "mission_scope_match" : "global_scope_match",
    ),
  };
}

function routeToNew(input: RoutingInput, proposal: NormalizedProposal): RoutingResult {
  const name = normalizeCollectionName(proposal.collection_name ?? "");
  if (!isSafeCollectionName(name)) {
    return review(proposal.confidence, [...proposal.reason_codes, "unsafe_collection_name"]);
  }
  if (!proposal.schema) {
    return review(proposal.confidence, [...proposal.reason_codes, "invalid_schema"]);
  }

  const fields = normalizeFields(proposal.fields, proposal.schema);
  if (Object.keys(fields).length < Math.min(2, proposal.schema.length)) {
    return review(proposal.confidence, [...proposal.reason_codes, "insufficient_supported_fields"]);
  }
  if (proposal.confidence < NEW_CONFIDENCE_FLOOR) {
    return review(proposal.confidence, [...proposal.reason_codes, "low_confidence"]);
  }

  const eligible = input.collections.filter((collection) =>
    collection.owner_id === input.ownerId &&
    collection.status !== "archived" &&
    collection.collection_type !== "saved_search" &&
    scopeRank(collection, input.missionId) !== Number.POSITIVE_INFINITY
  );
  const equivalents = eligible.filter((collection) =>
    isEquivalentCollection(collection, name, proposal.schema!)
  );
  const equivalent = chooseEquivalent(equivalents, input.missionId, name);
  if (equivalent === "ambiguous") {
    return review(proposal.confidence, [...proposal.reason_codes, "ambiguous_candidates"]);
  }
  if (equivalent) {
    const schema = normalizeSchema(equivalent.schema ?? equivalent.schema_json, 1, 12)!;
    const equivalentFields = normalizeFields(proposal.fields, schema);
    if (!Object.keys(equivalentFields).length) {
      return review(proposal.confidence, [...proposal.reason_codes, "insufficient_supported_fields"]);
    }
    return {
      outcome: "existing",
      collection_id: equivalent.id,
      schema,
      fields: equivalentFields,
      confidence: proposal.confidence,
      reason_codes: reasons(
        proposal.reason_codes,
        "equivalent_collection",
        equivalent.mission_id ? "mission_scope_match" : "global_scope_match",
      ),
    };
  }

  const archivedEquivalent = input.collections.some((collection) =>
    collection.owner_id === input.ownerId &&
    collection.status === "archived" &&
    collection.collection_type !== "saved_search" &&
    scopeRank(collection, input.missionId) !== Number.POSITIVE_INFINITY &&
    isEquivalentCollection(collection, name, proposal.schema!)
  );
  if (archivedEquivalent) {
    return review(proposal.confidence, [...proposal.reason_codes, "inactive_collection"]);
  }

  return {
    outcome: "new",
    collection_name: name,
    collection_description: boundedDescription(proposal.collection_description),
    normalized_name: collectionNameKey(name),
    schema_signature: schemaSignature(proposal.schema),
    schema: proposal.schema,
    fields,
    confidence: proposal.confidence,
    reason_codes: reasons(
      proposal.reason_codes,
      "no_equivalent_collection",
      input.missionId ? "mission_scope_match" : "global_scope_match",
    ),
  };
}

function normalizeProposal(value: unknown): NormalizedProposal | null {
  const parsed = parseObject(value);
  if (!parsed) return null;
  if (parsed.outcome !== "existing" && parsed.outcome !== "new" && parsed.outcome !== "review") {
    return null;
  }

  return {
    outcome: parsed.outcome,
    existing_collection_id: boundedString(parsed.existing_collection_id, 100),
    collection_name: boundedString(parsed.collection_name, 80),
    collection_description: boundedString(parsed.collection_description, 240),
    schema: normalizeSchema(parsed.schema, 2, 12),
    fields: parsed.fields && typeof parsed.fields === "object" && !Array.isArray(parsed.fields)
      ? parsed.fields as Record<string, unknown>
      : {},
    confidence: clampConfidence(parsed.confidence),
    reason_codes: Array.isArray(parsed.reason_codes)
      ? reasons(parsed.reason_codes.filter(isModelReasonCode))
      : [],
  };
}

function normalizeSchema(value: unknown, minimum: number, maximum: number): RoutingField[] | null {
  let parsed = value;
  if (typeof value === "string") {
    try {
      parsed = JSON.parse(value);
    } catch {
      return null;
    }
  }
  if (!Array.isArray(parsed) || parsed.length < minimum || parsed.length > maximum * 3) return null;

  const names = new Set<string>();
  const schema: RoutingField[] = [];
  for (const item of parsed) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const field = item as Record<string, unknown>;
    const name = typeof field.name === "string"
      ? field.name.trim().toLowerCase().replace(/[^a-z0-9_]/g, "_").replace(/^_+|_+$/g, "")
      : "";
    if (!name || names.has(name)) continue;
    const type = normalizeFieldType(field.type);
    if (!type) continue;
    names.add(name);
    schema.push({
      name,
      label: boundedString(field.label, 50) ?? humanize(name),
      type,
    });
    if (schema.length === maximum) break;
  }
  return schema.length >= minimum ? schema : null;
}

function normalizeFields(
  input: Record<string, unknown>,
  schema: RoutingField[],
): Record<string, string | number | boolean> {
  return schema.reduce<Record<string, string | number | boolean>>((result, field) => {
    const value = input[field.name];
    if (field.type === "string" && typeof value === "string" && value.trim()) {
      result[field.name] = value.trim().slice(0, 2_000);
    } else if (field.type === "number") {
      const numericValue = normalizeNumericValue(value);
      if (numericValue !== undefined) result[field.name] = numericValue;
    } else if (field.type === "boolean") {
      const booleanValue = normalizeBooleanValue(value);
      if (booleanValue !== undefined) result[field.name] = booleanValue;
    }
    return result;
  }, {});
}

function isEquivalentCollection(collection: RoutingCollection, proposedName: string, proposedSchema: RoutingField[]) {
  const storedSchema = normalizeSchema(collection.schema ?? collection.schema_json, 1, 12);
  if (!storedSchema) return false;
  const proposedKey = collectionNameKey(proposedName);
  const nameKeys = [
    collection.name,
    ...routingAliases(collection.routing_profile_json),
  ].map(collectionNameKey);
  return nameKeys.includes(proposedKey) || schemaSignature(storedSchema) === schemaSignature(proposedSchema);
}

function chooseEquivalent(
  collections: RoutingCollection[],
  missionId: string | undefined,
  proposedName: string,
): RoutingCollection | "ambiguous" | undefined {
  if (!collections.length) return undefined;
  const ordered = [...collections].sort((left, right) => {
    const scopeDifference = scopeRank(left, missionId) - scopeRank(right, missionId);
    if (scopeDifference) return scopeDifference;
    const leftExact = collectionNameKey(left.name) === collectionNameKey(proposedName) ? 0 : 1;
    const rightExact = collectionNameKey(right.name) === collectionNameKey(proposedName) ? 0 : 1;
    return leftExact - rightExact;
  });
  const best = ordered[0];
  const tied = ordered.filter((collection) =>
    scopeRank(collection, missionId) === scopeRank(best, missionId) &&
    (collectionNameKey(collection.name) === collectionNameKey(proposedName)) ===
      (collectionNameKey(best.name) === collectionNameKey(proposedName))
  );
  return tied.length === 1 ? best : "ambiguous";
}

function scopeRank(collection: RoutingCollection, missionId?: string) {
  const collectionMissionId = collection.mission_id || undefined;
  if (!missionId) return collectionMissionId ? Number.POSITIVE_INFINITY : 0;
  if (collectionMissionId === missionId) return 0;
  if (!collectionMissionId) return 1;
  return Number.POSITIVE_INFINITY;
}

export function isSafeCollectionName(name: string) {
  if (name.length < 2 || name.length > 48) return false;
  if (!/^[\p{L}\p{N}][\p{L}\p{N} &/-]*$/u.test(name)) return false;
  if (/^mission\s*[·:—-]/iu.test(name)) return false;
  if (/^saved clips?\b/iu.test(name)) return false;
  if (/(?:https?:\/\/|www\.|\.[a-z]{2,}\b)/iu.test(name)) return false;
  const letterTokens = name.match(/\p{L}+/gu) ?? [];
  const isLatinOnly = letterTokens.length > 0 &&
    letterTokens.every((token) => /^\p{Script=Latin}+$/u.test(token));
  if (!isLatinOnly) return true;
  const lastWord = name.split(/\s+/).at(-1)?.toLocaleLowerCase("en") ?? "";
  return lastWord.endsWith("s");
}

function normalizeNumericValue(value: unknown): number | undefined {
  if (typeof value === "number") return Number.isFinite(value) ? value : undefined;
  if (typeof value !== "string") return undefined;

  const normalized = value
    .normalize("NFKC")
    .replace(/[\u200e\u200f\u202a-\u202e\u2066-\u2069]/g, "")
    .trim();
  const match = normalized.match(/[-+]?\d(?:[\d\s\u00a0,.'’]*\d)?/u);
  if (!match) return undefined;

  let numeric = match[0].replace(/[\s\u00a0'’]/g, "");
  const commaIndex = numeric.lastIndexOf(",");
  const dotIndex = numeric.lastIndexOf(".");
  if (commaIndex >= 0 && dotIndex >= 0) {
    const decimalSeparator = commaIndex > dotIndex ? "," : ".";
    const groupingSeparator = decimalSeparator === "," ? "." : ",";
    numeric = numeric.replaceAll(groupingSeparator, "").replace(decimalSeparator, ".");
  } else {
    const separator = commaIndex >= 0 ? "," : dotIndex >= 0 ? "." : "";
    if (separator) {
      const parts = numeric.split(separator);
      const groupedThousands = parts.length > 2 ||
        (parts.length === 2 && parts[1].length === 3 && parts[0].replace(/^[-+]/, "").length <= 3);
      numeric = groupedThousands
        ? parts.join("")
        : `${parts.slice(0, -1).join("")}.${parts.at(-1)}`;
    }
  }

  const parsed = Number(numeric);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function normalizeBooleanValue(value: unknown): boolean | undefined {
  if (typeof value === "boolean") return value;
  if (typeof value !== "string") return undefined;
  const normalized = value.normalize("NFKC").trim().toLocaleLowerCase("en");
  if (["true", "yes", "y", "1", "כן"].includes(normalized)) return true;
  if (["false", "no", "n", "0", "לא"].includes(normalized)) return false;
  return undefined;
}

function parseObject(value: unknown): Record<string, unknown> | null {
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value.replace(/^```json\s*|\s*```$/gi, ""));
      return parsed && typeof parsed === "object" && !Array.isArray(parsed)
        ? parsed as Record<string, unknown>
        : null;
    } catch {
      return null;
    }
  }
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function review(confidence: number, reasonCodes: ReasonCode[]): ReviewRoutingResult {
  const uniqueReasons = reasons(reasonCodes);
  return {
    outcome: "review",
    confidence: clampConfidence(confidence),
    reason_codes: uniqueReasons.sort((left, right) => {
      const leftPriority = REVIEW_REASON_PRIORITY.indexOf(left);
      const rightPriority = REVIEW_REASON_PRIORITY.indexOf(right);
      return (leftPriority < 0 ? Number.POSITIVE_INFINITY : leftPriority) -
        (rightPriority < 0 ? Number.POSITIVE_INFINITY : rightPriority);
    }),
  };
}

function reasons(...groups: Array<ReasonCode | ReasonCode[]>) {
  return [...new Set(groups.flat())];
}

function isReasonCode(value: unknown): value is ReasonCode {
  return typeof value === "string" && REASON_CODES.has(value as ReasonCode);
}

function isModelReasonCode(value: unknown): value is ReasonCode {
  return isReasonCode(value) && MODEL_REASON_CODES.has(value);
}

function normalizeFieldType(value: unknown): RoutingField["type"] | undefined {
  if (typeof value !== "string") return undefined;
  switch (value.trim().toLocaleLowerCase("en")) {
    case "string":
    case "text":
    case "url":
    case "uri":
    case "date":
    case "datetime":
    case "date-time":
      return "string";
    case "number":
    case "integer":
    case "float":
    case "decimal":
    case "currency":
    case "money":
      return "number";
    case "boolean":
    case "bool":
      return "boolean";
    default:
      return undefined;
  }
}

function clampConfidence(value: unknown) {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.min(1, Math.max(0, value))
    : 0;
}

function boundedString(value: unknown, maxLength: number) {
  return typeof value === "string" && value.trim()
    ? value.trim().slice(0, maxLength)
    : undefined;
}

function boundedDescription(value: unknown) {
  return boundedString(value, 240);
}

function routingAliases(value: unknown) {
  const profile = parseObject(value);
  return profile && Array.isArray(profile.aliases)
    ? profile.aliases
      .filter((alias): alias is string => typeof alias === "string")
      .map((alias) => normalizeCollectionName(alias))
      .filter(Boolean)
      .slice(0, 20)
    : [];
}

function singularizeToken(token: string) {
  if (token.length > 4 && token.endsWith("ies")) return `${token.slice(0, -3)}y`;
  if (token.length > 3 && token.endsWith("ses")) return token.slice(0, -2);
  if (token.length > 3 && token.endsWith("s") && !token.endsWith("ss")) return token.slice(0, -1);
  return token;
}

function humanize(value: string) {
  const words = value.replace(/_/g, " ");
  return `${words.charAt(0).toUpperCase()}${words.slice(1)}`.slice(0, 50);
}
