import {
  acquireWithZyte,
  type ZyteExtractionProfile,
  type ZyteExtractionSource,
  productToEvidenceText,
} from "../base44/shared/zyte.ts";

const sourceUrl = Deno.args[0];
const requestedProfile = Deno.args[1] ?? "product";
const profiles: ZyteExtractionProfile[] = ["product", "article", "jobPosting", "review"];
const profile = profiles.includes(requestedProfile as ZyteExtractionProfile)
  ? requestedProfile as ZyteExtractionProfile
  : null;
const requestedSource = Deno.args[2] ?? "httpResponseBody";
const sources: ZyteExtractionSource[] = ["httpResponseBody", "browserHtmlOnly", "browserHtml", "userHtml"];
const extractFrom = sources.includes(requestedSource as ZyteExtractionSource)
  ? requestedSource as ZyteExtractionSource
  : null;
const apiKey = Deno.env.get("ZYTE_API_KEY") ?? "";

if (!sourceUrl) {
  console.error("Usage: deno run --allow-env --allow-net scripts/zyte-poc.ts <url> [product|article|jobPosting|review] [httpResponseBody|browserHtmlOnly|browserHtml]");
  Deno.exit(2);
}
if (!profile) {
  console.error(`Unknown Zyte profile: ${requestedProfile}`);
  Deno.exit(2);
}
if (!extractFrom || extractFrom === "userHtml") {
  console.error(`Unsupported POC extraction source: ${requestedSource}`);
  Deno.exit(2);
}
if (!apiKey) {
  console.error("ZYTE_API_KEY is not configured in this shell");
  Deno.exit(2);
}

const acquired = await acquireWithZyte(sourceUrl, apiKey, fetch, Date.now, profile, extractFrom);
const product = acquired.product;
const fields = product
  ? Object.keys(JSON.parse(productToEvidenceText(product) || "{}"))
  : [];
const providerFields = product
  ? Object.keys(product).filter((key) => key !== "metadata").sort()
  : [];

console.log(JSON.stringify({
  profile: acquired.profile,
  extract_from: acquired.extractFrom,
  outcome: acquired.result.status,
  retryable: acquired.result.retryable,
  error_code: acquired.result.errorCode,
  provider_request_id: acquired.result.providerRequestId,
  evidence_hash: acquired.result.evidenceHash,
  confidence: acquired.confidence,
  response_status: acquired.responseStatus,
  response_content_type: acquired.responseContentType,
  response_content_length: acquired.responseContentLength,
  response_body_available: acquired.responseBodyAvailable,
  response_body_bytes: acquired.responseBodyBytes,
  duration_ms: acquired.durationMs,
  fields,
  provider_fields: providerFields,
}, null, 2));
