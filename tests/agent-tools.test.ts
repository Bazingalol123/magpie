import {
  buildComparison,
  boundedLimit,
  configureWatch,
  nextCheckAt,
  parseWatchCommand,
  recordSummary,
  requireOwned,
  safeReasonCodes,
} from "../base44/shared/agent-tools.ts";
import { HttpError } from "../base44/shared/http.ts";

Deno.test("Agent tools reject cross-owner rows instead of returning partial data", () => {
  const error = assertThrows(
    () => requireOwned({ id: "record-1", owner_id: "owner-b" }, "owner-a", "Item"),
    HttpError,
  );
  assertEquals(error.status, 403);
});

Deno.test("Agent comparison is bounded and preserves heterogeneous fields", () => {
  const result = buildComparison(
    [
      {
        id: "record-1",
        owner_id: "owner-a",
        collection_id: "collection-1",
        fields_json: JSON.stringify({ model: "Nikon D500", price: "4500 ILS" }),
        source_url: "https://example.com/one",
      },
      {
        id: "record-2",
        owner_id: "owner-a",
        collection_id: "collection-1",
        fields_json: JSON.stringify({ model: "Canon R8", weight: "461g" }),
        source_url: "https://example.com/two",
      },
    ],
    [{
      id: "collection-1",
      owner_id: "owner-a",
      name: "Cameras",
      schema_json: "[]",
    }],
    "owner-a",
  );

  assertEquals(result.item_count, 2);
  assertEquals(result.field_names, ["model", "price", "weight"]);
  assertEquals(result.items[0].collection_name, "Cameras");
});

Deno.test("Agent comparison rejects a mixed-owner request as one failure", () => {
  const error = assertThrows(
    () =>
      buildComparison(
        [
          { id: "one", owner_id: "owner-a", collection_id: "collection", fields_json: "{}" },
          { id: "two", owner_id: "owner-b", collection_id: "collection", fields_json: "{}" },
        ],
        [{ id: "collection", owner_id: "owner-a", name: "Cameras" }],
        "owner-a",
      ),
    HttpError,
  );
  assertEquals(error.status, 403);
});

Deno.test("Agent Item summaries cap fields and string size", () => {
  const fields = Object.fromEntries(
    Array.from({ length: 20 }, (_, index) => [`field_${index}`, "x".repeat(3_000)]),
  );
  const summary = recordSummary({
    id: "record",
    owner_id: "owner",
    collection_id: "collection",
    fields_json: JSON.stringify(fields),
  });
  assertEquals(Object.keys(summary.fields).length, 12);
  assertEquals(String(summary.fields.field_0).length, 2_000);
});

Deno.test("Agent watch command validates authority-shaped inputs", () => {
  assertEquals(parseWatchCommand({
    action: "create",
    record_id: "record_1",
    condition: "Tell me when the price changes",
  }), {
    action: "create",
    recordId: "record_1",
    watchRuleId: undefined,
    condition: "Tell me when the price changes",
    frequency: undefined,
  });

  const error = assertThrows(
    () => parseWatchCommand({ action: "pause", record_id: "record_1" }),
    HttpError,
  );
  assertEquals(error.status, 400);
});

Deno.test("Agent helpers bound limits, schedules, and routing reasons", () => {
  assertEquals(boundedLimit(undefined), 12);
  assertThrows(() => boundedLimit(26), HttpError);
  assertEquals(
    nextCheckAt("hourly", new Date("2026-07-25T00:00:00.000Z")),
    "2026-07-25T01:00:00.000Z",
  );
  assertEquals(
    safeReasonCodes(JSON.stringify(["existing_schema_match", "private_model_note"])),
    ["existing_schema_match"],
  );
  assert(safeReasonCodes("[\"auto_project_match\"]", true).includes("auto_project_match"));
});

Deno.test("Agent watch creation is idempotent for one owner and Item", async () => {
  const watches: any[] = [];
  let createCount = 0;
  const service = {
    Record: {
      get: async (id: string) => ({ id, owner_id: "owner-a" }),
    },
    WatchRule: {
      get: async (id: string) => watches.find((watch) => watch.id === id),
      filter: async (query: Record<string, string>) =>
        watches.filter((watch) =>
          watch.owner_id === query.owner_id && watch.record_id === query.record_id
        ),
      create: async (payload: Record<string, unknown>) => {
        createCount += 1;
        const watch = { id: `watch-${createCount}`, ...payload };
        watches.push(watch);
        return watch;
      },
      update: async (id: string, payload: Record<string, unknown>) => {
        const index = watches.findIndex((watch) => watch.id === id);
        watches[index] = { ...watches[index], ...payload };
        return watches[index];
      },
    },
  };
  const command = parseWatchCommand({
    action: "create",
    record_id: "record-1",
    condition: "Tell me when the price changes",
    frequency: "daily",
  });

  const first = await configureWatch(service, "owner-a", command);
  const retry = await configureWatch(service, "owner-a", command);

  assertEquals(first.created, true);
  assertEquals(retry.created, false);
  assertEquals(first.watch.id, retry.watch.id);
  assertEquals(watches.length, 1);
  assertEquals(createCount, 1);
});

function assert(condition: unknown, message = "Assertion failed"): asserts condition {
  if (!condition) throw new Error(message);
}

function assertEquals(actual: unknown, expected: unknown, message = "Values differ") {
  const actualJson = JSON.stringify(actual);
  const expectedJson = JSON.stringify(expected);
  if (actualJson !== expectedJson) {
    throw new Error(`${message}: expected ${expectedJson}, got ${actualJson}`);
  }
}

function assertThrows<T extends Error>(
  callback: () => unknown,
  errorType: new (...args: any[]) => T,
): T {
  try {
    callback();
  } catch (error) {
    if (error instanceof errorType) return error;
    throw error;
  }
  throw new Error("Expected function to throw");
}

Deno.test("Agent watch configuration maps a hosted not-found throw to 404", async () => {
  const service = {
    Record: {
      get: async (id: string) => {
        throw new Error(`Entity Record with ID ${id} not found`);
      },
    },
    WatchRule: {},
  };
  const command = parseWatchCommand({
    action: "create",
    record_id: "record-gone",
    condition: "Tell me when the price changes",
  });

  try {
    await configureWatch(service, "owner-a", command);
    throw new Error("expected an HttpError");
  } catch (error) {
    if (!(error instanceof HttpError)) throw error;
    assertEquals(error.status, 404);
  }
});
