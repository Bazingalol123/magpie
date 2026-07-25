import { HttpError } from "./http.ts";
import { getOrNull } from "./service-entities.ts";

type OwnerRow = {
  id: string;
  owner_id: string;
  [key: string]: unknown;
};

type AgentRecord = OwnerRow & {
  collection_id?: string;
  mission_id?: string;
  fields_json?: string;
  source_url?: string;
  freshness?: string;
  processing_status?: string;
  decision_status?: string;
  last_check_at?: string;
  last_changed_at?: string;
  updated_date?: string;
};

type AgentCollection = OwnerRow & {
  name?: string;
  description?: string;
  mission_id?: string;
  schema_json?: string;
  status?: string;
};

const ROUTING_REASON_CODES = new Set([
  "existing_schema_match",
  "equivalent_collection",
  "mission_scope_match",
  "global_scope_match",
  "no_equivalent_collection",
  "ambiguous_candidates",
  "mixed_content",
  "malformed_ai_response",
  "ai_unavailable",
  "cross_owner_candidate",
  "inactive_collection",
  "ineligible_scope",
  "invalid_schema",
  "unsupported_schema",
  "insufficient_supported_fields",
  "low_confidence",
  "unsafe_collection_name",
]);

const PROJECT_REASON_CODES = new Set([
  "explicit_project_context",
  "auto_project_match",
  "no_project_match",
  "ambiguous_projects",
  "low_project_confidence",
  "invalid_project_candidate",
]);

export function requireOwned<T extends OwnerRow>(
  row: T | null | undefined,
  ownerId: string,
  label: string,
): T {
  if (!row) throw new HttpError(404, `${label} not found`);
  if (row.owner_id !== ownerId) throw new HttpError(403, `${label} belongs to another owner`);
  return row;
}

export function requireOwnedList<T extends OwnerRow>(
  rows: T[],
  ownerId: string,
  label: string,
): T[] {
  if (rows.some((row) => row.owner_id !== ownerId)) {
    throw new HttpError(403, `${label} belongs to another owner`);
  }
  return rows;
}

export function optionalId(value: unknown, field: string) {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "string" || !/^[A-Za-z0-9_-]{1,160}$/.test(value)) {
    throw new HttpError(400, `${field} must be a valid ID`);
  }
  return value;
}

export function boundedLimit(value: unknown, fallback = 12, maximum = 25) {
  if (value === undefined || value === null) return fallback;
  if (!Number.isInteger(value) || Number(value) < 1 || Number(value) > maximum) {
    throw new HttpError(400, `limit must be between 1 and ${maximum}`);
  }
  return Number(value);
}

export function recordSummary(record: AgentRecord, collection?: AgentCollection) {
  return {
    id: record.id,
    collection_id: record.collection_id,
    collection_name: collection?.name,
    project_id: record.mission_id ?? collection?.mission_id,
    fields: boundedObject(record.fields_json, 12, 2_000),
    source_url: boundedText(record.source_url, 2_000),
    freshness: boundedText(record.freshness, 40),
    processing_status: boundedText(record.processing_status, 40),
    decision_status: boundedText(record.decision_status, 40),
    last_check_at: boundedText(record.last_check_at, 80),
    last_changed_at: boundedText(record.last_changed_at, 80),
    updated_at: boundedText(record.updated_date, 80),
  };
}

export function collectionSummary(collection: AgentCollection) {
  return {
    id: collection.id,
    name: boundedText(collection.name, 120),
    description: boundedText(collection.description, 240),
    project_id: collection.mission_id,
    status: boundedText(collection.status, 40),
    schema_fields: boundedSchema(collection.schema_json),
  };
}

export function buildComparison(
  records: AgentRecord[],
  collections: AgentCollection[],
  ownerId: string,
) {
  if (records.length < 2 || records.length > 12) {
    throw new HttpError(400, "Compare between 2 and 12 Items");
  }
  if (new Set(records.map((record) => record.id)).size !== records.length) {
    throw new HttpError(400, "record_ids must be unique");
  }
  requireOwnedList(records, ownerId, "Item");
  requireOwnedList(collections, ownerId, "Collection");

  const collectionById = new Map(collections.map((collection) => [collection.id, collection]));
  const items = records.map((record) => {
    const collection = collectionById.get(String(record.collection_id ?? ""));
    if (!collection) throw new HttpError(404, "Collection not found for one of the Items");
    return recordSummary(record, collection);
  });
  const fieldNames = [...new Set(items.flatMap((item) => Object.keys(item.fields)))].slice(0, 40);

  return {
    item_count: items.length,
    field_names: fieldNames,
    items,
  };
}

export function safeReasonCodes(value: unknown, project = false) {
  const allowlist = project ? PROJECT_REASON_CODES : ROUTING_REASON_CODES;
  const parsed = jsonArray(value);
  return parsed
    .filter((code): code is string => typeof code === "string" && allowlist.has(code))
    .slice(0, 12);
}

export type WatchCommand = {
  action: "create" | "update" | "pause" | "resume";
  recordId: string;
  watchRuleId?: string;
  condition?: string;
  frequency?: "hourly" | "daily" | "weekly";
};

export function parseWatchCommand(input: Record<string, unknown>): WatchCommand {
  const action = input.action;
  if (action !== "create" && action !== "update" && action !== "pause" && action !== "resume") {
    throw new HttpError(400, "action must be create, update, pause, or resume");
  }
  const recordId = optionalId(input.record_id, "record_id");
  if (!recordId) throw new HttpError(400, "record_id is required");
  const watchRuleId = optionalId(input.watch_rule_id, "watch_rule_id");
  const frequency = input.frequency === undefined
    ? undefined
    : normalizeFrequency(input.frequency);
  const condition = input.condition === undefined
    ? undefined
    : requiredText(input.condition, "condition", 3, 500);

  if (action === "create" && !condition) {
    throw new HttpError(400, "condition is required when creating a watch");
  }
  if ((action === "update" || action === "pause" || action === "resume") && !watchRuleId) {
    throw new HttpError(400, "watch_rule_id is required for this action");
  }
  if (action === "update" && !condition && !frequency) {
    throw new HttpError(400, "Update at least one watch field");
  }

  return { action, recordId, watchRuleId, condition, frequency };
}

export function nextCheckAt(frequency: "hourly" | "daily" | "weekly", from = new Date()) {
  const milliseconds = frequency === "hourly"
    ? 60 * 60 * 1_000
    : frequency === "weekly"
    ? 7 * 24 * 60 * 60 * 1_000
    : 24 * 60 * 60 * 1_000;
  return new Date(from.getTime() + milliseconds).toISOString();
}

export async function configureWatch(
  service: any,
  ownerId: string,
  command: WatchCommand,
) {
  const record = requireOwned(await getOrNull(service.Record, command.recordId), ownerId, "Item");
  let existing;
  if (command.watchRuleId) {
    existing = requireOwned(await getOrNull(service.WatchRule, command.watchRuleId), ownerId, "Watch");
  } else {
    const matches = await service.WatchRule.filter(
      { owner_id: ownerId, record_id: command.recordId },
      "-created_date",
      1,
    );
    existing = matches[0] ? requireOwned(matches[0], ownerId, "Watch") : undefined;
  }
  if (existing && existing.record_id !== record.id) {
    throw new HttpError(409, "Watch does not belong to the requested Item");
  }
  if (command.action !== "create" && !existing) {
    throw new HttpError(404, "Watch not found");
  }

  const frequency = command.frequency ?? existing?.frequency ?? "daily";
  const condition = command.condition ?? existing?.natural_language_condition;
  if (!condition) throw new HttpError(400, "condition is required");
  const active = command.action === "pause"
    ? false
    : command.action === "resume" || command.action === "create"
    ? true
    : existing?.active ?? true;
  const payload = {
    natural_language_condition: condition,
    frequency,
    active,
    ...(active ? { next_check_at: nextCheckAt(frequency) } : {}),
  };

  const created = !existing;
  const watch = existing
    ? await service.WatchRule.update(existing.id, payload)
    : await service.WatchRule.create({
      owner_id: ownerId,
      record_id: record.id,
      ...payload,
      failure_count: 0,
    });
  return { created, watch };
}

export function boundedText(value: unknown, maximum: number) {
  return typeof value === "string" && value.trim()
    ? value.trim().slice(0, maximum)
    : undefined;
}

function boundedObject(value: unknown, maxFields: number, maxValueLength: number) {
  const parsed = jsonObject(value);
  if (!parsed) return {};
  return Object.entries(parsed).slice(0, maxFields).reduce<Record<string, string | number | boolean>>(
    (result, [name, fieldValue]) => {
      const key = name.slice(0, 80);
      if (typeof fieldValue === "string") result[key] = fieldValue.slice(0, maxValueLength);
      if (typeof fieldValue === "number" && Number.isFinite(fieldValue)) result[key] = fieldValue;
      if (typeof fieldValue === "boolean") result[key] = fieldValue;
      return result;
    },
    {},
  );
}

function boundedSchema(value: unknown) {
  const parsed = jsonArray(value);
  return parsed.slice(0, 12).flatMap((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return [];
    const field = item as Record<string, unknown>;
    const name = boundedText(field.name, 80);
    if (!name) return [];
    return [{
      name,
      label: boundedText(field.label, 100) ?? name,
      type: boundedText(field.type, 30) ?? "string",
    }];
  });
}

function jsonObject(value: unknown): Record<string, unknown> | undefined {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  if (typeof value !== "string") return undefined;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : undefined;
  } catch {
    return undefined;
  }
}

function jsonArray(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (typeof value !== "string") return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function normalizeFrequency(value: unknown): "hourly" | "daily" | "weekly" {
  if (value === "hourly" || value === "daily" || value === "weekly") return value;
  throw new HttpError(400, "frequency must be hourly, daily, or weekly");
}

function requiredText(
  value: unknown,
  field: string,
  minimum: number,
  maximum: number,
) {
  if (typeof value !== "string") throw new HttpError(400, `${field} must be text`);
  const normalized = value.trim();
  if (normalized.length < minimum || normalized.length > maximum) {
    throw new HttpError(400, `${field} must be between ${minimum} and ${maximum} characters`);
  }
  return normalized;
}
