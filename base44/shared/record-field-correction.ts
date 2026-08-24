import { HttpError } from "./http.ts";
import { getOrNull } from "./service-entities.ts";

export type RecordFieldCorrectionCommand = {
  recordId: string;
  field: string;
  expectedValue: string | number | boolean | null;
  newValue: string | number | boolean | null;
};

const ID_PATTERN = /^[A-Za-z0-9_-]{1,160}$/;
const FIELD_PATTERN = /^[A-Za-z][A-Za-z0-9_ -]{0,79}$/;

function isScalar(value: unknown): value is string | number | boolean | null {
  return value === null || ["string", "number", "boolean"].includes(typeof value);
}

export function parseRecordFieldCorrection(input: unknown): RecordFieldCorrectionCommand {
  if (!input || typeof input !== "object") throw new HttpError(400, "Request body is required");
  const body = input as Record<string, unknown>;
  if (typeof body.record_id !== "string" || !ID_PATTERN.test(body.record_id)) throw new HttpError(400, "record_id is required");
  if (typeof body.field !== "string" || !FIELD_PATTERN.test(body.field)) throw new HttpError(400, "field is invalid");
  if (!("expected_value" in body) || !isScalar(body.expected_value)) throw new HttpError(400, "expected_value must be a scalar value");
  if (!("new_value" in body) || !isScalar(body.new_value)) throw new HttpError(400, "new_value must be a scalar value");
  if (typeof body.new_value === "string" && body.new_value.length > 2000) throw new HttpError(400, "new_value is too long");
  if (typeof body.new_value === "number" && !Number.isFinite(body.new_value)) throw new HttpError(400, "new_value must be finite");
  return { recordId: body.record_id, field: body.field, expectedValue: body.expected_value, newValue: body.new_value };
}

function sameValue(left: unknown, right: unknown) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function auditValue(value: unknown) {
  if (typeof value === "string") return value;
  return JSON.stringify(value);
}

export async function correctRecordField(service: any, ownerId: string, command: RecordFieldCorrectionCommand) {
  const record = await getOrNull(service.Record, command.recordId);
  if (!record) throw new HttpError(404, "Item was not found");
  if (record.owner_id !== ownerId) throw new HttpError(403, "This Item belongs to another workspace");
  const collection = await getOrNull(service.Collection, record.collection_id);
  if (!collection) throw new HttpError(404, "Collection was not found");
  if (collection.owner_id !== ownerId) throw new HttpError(403, "This Collection belongs to another workspace");

  let schema: Array<{ name?: unknown }>;
  try {
    schema = JSON.parse(collection.schema_json);
  } catch {
    throw new HttpError(409, "This Collection's schema cannot be edited safely");
  }
  if (!Array.isArray(schema) || !schema.some((field) => field?.name === command.field)) throw new HttpError(404, "Field was not found in this Collection's schema");

  let fields: Record<string, unknown>;
  try {
    fields = JSON.parse(record.fields_json);
  } catch {
    throw new HttpError(409, "This Item's fields cannot be edited safely");
  }
  if (!fields || Array.isArray(fields) || typeof fields !== "object") throw new HttpError(409, "This Item's fields cannot be edited safely");
  if (!(command.field in fields)) throw new HttpError(404, "Field was not found on this Item");
  if (!isScalar(fields[command.field])) throw new HttpError(400, "Only scalar fields can be corrected");
  if (!sameValue(fields[command.field], command.expectedValue)) throw new HttpError(409, "This field changed since you opened it. Review the latest value and try again.");
  if (sameValue(fields[command.field], command.newValue)) throw new HttpError(409, "The corrected value is unchanged");

  const checkedAt = new Date().toISOString();
  const oldValue = fields[command.field];
  const nextFields = { ...fields, [command.field]: command.newValue };
  const updatedRecord = await service.Record.update(record.id, {
    fields_json: JSON.stringify(nextFields),
    last_changed_at: checkedAt,
  });
  const enrichment = await service.Enrichment.create({
    owner_id: ownerId,
    record_id: record.id,
    field: command.field,
    old_value: auditValue(oldValue),
    new_value: auditValue(command.newValue),
    checked_at: checkedAt,
    agent_id: "owner-correction-v1",
  });
  return { changed: true, record: updatedRecord, enrichment };
}
