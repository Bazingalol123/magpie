import { correctRecordField, parseRecordFieldCorrection } from "../base44/shared/record-field-correction.ts";
import { HttpError } from "../base44/shared/http.ts";

function fakeService(seed: Record<string, any[]> = {}) {
  const tables = Object.fromEntries(Object.entries(seed).map(([name, rows]) => [name, rows.map((row) => ({ ...row }))]));
  return {
    tables,
    service: Object.fromEntries(["Record", "Collection", "Enrichment"].map((name) => [name, {
      get: async (id: string) => tables[name]?.find((row: any) => row.id === id) ?? null,
      update: async (id: string, changes: Record<string, unknown>) => {
        const index = tables[name].findIndex((row: any) => row.id === id);
        tables[name][index] = { ...tables[name][index], ...changes };
        return tables[name][index];
      },
      create: async (data: Record<string, unknown>) => {
        const row = { id: `${name.toLowerCase()}-${tables[name].length + 1}`, ...data };
        tables[name].push(row);
        return row;
      },
    }])) as any,
  };
}

function assertEquals(actual: unknown, expected: unknown) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

async function assertHttpError(callback: () => Promise<unknown>, status: number) {
  try { await callback(); } catch (error) {
    if (error instanceof HttpError && error.status === status) return;
    throw error;
  }
  throw new Error(`expected HttpError ${status}`);
}

const record = { id: "record-1", owner_id: "owner-1", collection_id: "collection-1", fields_json: JSON.stringify({ title: "Alpha", price: 1200 }) };
const collection = { id: "collection-1", owner_id: "owner-1", schema_json: JSON.stringify([{ name: "title" }, { name: "price" }]) };

Deno.test("owner field correction updates the Record and writes an audit Enrichment", async () => {
  const { service, tables } = fakeService({ Record: [record], Collection: [collection], Enrichment: [] });
  const result = await correctRecordField(service, "owner-1", parseRecordFieldCorrection({ record_id: "record-1", field: "price", expected_value: 1200, new_value: 1100 }));
  assertEquals(result.changed, true);
  assertEquals(JSON.parse(tables.Record[0].fields_json).price, 1100);
  assertEquals(tables.Enrichment[0].agent_id, "owner-correction-v1");
  assertEquals(tables.Enrichment[0].old_value, "1200");
});

Deno.test("field correction rejects cross-owner access", async () => {
  const { service } = fakeService({ Record: [record], Collection: [collection], Enrichment: [] });
  await assertHttpError(() => correctRecordField(service, "owner-2", { recordId: "record-1", field: "price", expectedValue: 1200, newValue: 1100 }), 403);
});

Deno.test("field correction detects stale expected values", async () => {
  const { service } = fakeService({ Record: [record], Collection: [collection], Enrichment: [] });
  await assertHttpError(() => correctRecordField(service, "owner-1", { recordId: "record-1", field: "price", expectedValue: 1250, newValue: 1100 }), 409);
});

Deno.test("field correction rejects an unchanged value without an audit row", async () => {
  const { service, tables } = fakeService({ Record: [record], Collection: [collection], Enrichment: [] });
  await assertHttpError(() => correctRecordField(service, "owner-1", { recordId: "record-1", field: "price", expectedValue: 1200, newValue: 1200 }), 409);
  assertEquals(tables.Enrichment.length, 0);
});
