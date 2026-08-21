import type { ZyteAcquisition, ZyteProduct } from "./zyte.ts";

export const DEFAULT_ZYTE_MIN_CONFIDENCE = 0.75;
export const MIN_ZYTE_MIN_CONFIDENCE = 0;
export const MAX_ZYTE_MIN_CONFIDENCE = 0.99;

export type ZyteQualityDecision = {
  decision: "accepted" | "insufficient_evidence" | "provider_failure";
  reason: "ACCEPTED" | "LOW_CONFIDENCE" | "MISSING_REQUIRED_FIELDS" | "PROVIDER_FAILURE";
  missingFields: string[];
  minConfidence: number;
};

export function evaluateZyteQuality(
  acquisition: ZyteAcquisition,
  requiredFields: string[] = [],
  requestedMinConfidence = DEFAULT_ZYTE_MIN_CONFIDENCE,
): ZyteQualityDecision {
  const minConfidence = clampConfidence(requestedMinConfidence);
  if (acquisition.result.status !== "success" || !acquisition.product) {
    return { decision: "provider_failure", reason: "PROVIDER_FAILURE", missingFields: [], minConfidence };
  }

  const product = acquisition.product;
  const missingFields = requiredFields.filter((field) => !hasUsableValue(product, field));
  if (missingFields.length) {
    return { decision: "insufficient_evidence", reason: "MISSING_REQUIRED_FIELDS", missingFields, minConfidence };
  }
  if (acquisition.confidence === undefined || acquisition.confidence < minConfidence) {
    return { decision: "insufficient_evidence", reason: "LOW_CONFIDENCE", missingFields: [], minConfidence };
  }
  return { decision: "accepted", reason: "ACCEPTED", missingFields: [], minConfidence };
}

function clampConfidence(value: number) {
  if (!Number.isFinite(value)) return DEFAULT_ZYTE_MIN_CONFIDENCE;
  return Math.min(Math.max(value, MIN_ZYTE_MIN_CONFIDENCE), MAX_ZYTE_MIN_CONFIDENCE);
}

function hasUsableValue(product: ZyteProduct, field: string) {
  const value = product[field];
  if (typeof value === "string") return Boolean(value.trim());
  if (typeof value === "number") return Number.isFinite(value);
  if (value && typeof value === "object") return true;
  return false;
}
