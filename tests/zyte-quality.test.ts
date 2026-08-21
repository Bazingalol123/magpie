import { assertEquals } from "jsr:@std/assert";
import { evaluateZyteQuality } from "../base44/shared/zyte-quality.ts";
import type { ZyteAcquisition } from "../base44/shared/zyte.ts";

function acquisition(product: Record<string, unknown>, confidence: number, status = "success"): ZyteAcquisition {
  return {
    result: { status: status as any, strategy: "zyte", retryable: status !== "success" },
    product,
    confidence,
    durationMs: 1_000,
  };
}

Deno.test("quality gate accepts complete high-confidence evidence", () => {
  assertEquals(
    evaluateZyteQuality(acquisition({ name: "Rack", price: "USD 149", availability: "In stock" }, 0.99), ["name", "price"]),
    { decision: "accepted", reason: "ACCEPTED", missingFields: [], minConfidence: 0.75 },
  );
});

Deno.test("quality gate rejects low-confidence partial Amazon-style evidence", () => {
  assertEquals(
    evaluateZyteQuality(acquisition({ description: "A rack" }, 0.002), ["name", "price"]),
    { decision: "insufficient_evidence", reason: "MISSING_REQUIRED_FIELDS", missingFields: ["name", "price"], minConfidence: 0.75 },
  );
});

Deno.test("quality gate rejects complete but low-confidence evidence", () => {
  assertEquals(
    evaluateZyteQuality(acquisition({ name: "Listing", price: "ILS 1,000" }, 0.24), ["name", "price"], 0.8),
    { decision: "insufficient_evidence", reason: "LOW_CONFIDENCE", missingFields: [], minConfidence: 0.8 },
  );
});

Deno.test("quality gate preserves retryable provider failures", () => {
  assertEquals(
    evaluateZyteQuality(acquisition({}, 0, "unreachable"), ["name"]),
    { decision: "provider_failure", reason: "PROVIDER_FAILURE", missingFields: [], minConfidence: 0.75 },
  );
});

Deno.test("quality gate clamps a user threshold to the safe range", () => {
  assertEquals(
    evaluateZyteQuality(acquisition({ name: "Item" }, 0.99), ["name"], 2).minConfidence,
    0.99,
  );
  assertEquals(
    evaluateZyteQuality(acquisition({ name: "Item" }, 0.01), ["name"], -1).minConfidence,
    0,
  );
});
