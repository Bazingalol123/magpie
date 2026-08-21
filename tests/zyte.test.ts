import { assert, assertEquals, assertStringIncludes } from "jsr:@std/assert";
import { acquireWithZyte, normalizeProduct, productToEvidenceText } from "../base44/shared/zyte.ts";

function response(
  body: unknown,
  status = 200,
  headers: Record<string, string> = {},
) {
  return new Response(JSON.stringify(body), { status, headers });
}

Deno.test("acquireWithZyte sends product extraction and returns normalized metadata", async () => {
  let request: RequestInit | undefined;
  const result = await acquireWithZyte(
    "https://example.test/item",
    "test-key",
    async (_url, init) => {
      request = init;
      return response(
        {
          name: "Test item",
          price: "149",
          currency: "USD",
          canonicalUrl: "https://example.test/item",
          metadata: {
            probability: 0.91,
            dateDownloaded: "2026-08-19T12:00:00Z",
          },
        },
        200,
        { "x-zyte-request-id": "zyte-123" },
      );
    },
    () => 1_000,
  );

  assertEquals(request?.method, "POST");
  assertStringIncludes(String(request?.body), '"product":true');
  assert(!String(request?.body).includes('"httpResponseBody":true'));
  assertStringIncludes(String(request?.body), '"productOptions":{"extractFrom":"httpResponseBody"}');
  assertStringIncludes(String(request?.body), '"followRedirect":true');
  assertStringIncludes(
    String(
      request?.headers &&
        (request.headers as Record<string, string>).Authorization,
    ),
    "Basic",
  );
  assertEquals(result.result.status, "success");
  assertEquals(result.result.strategy, "zyte");
  assertEquals(result.result.providerRequestId, "zyte-123");
  assertEquals(result.confidence, 0.91);
  assertEquals(result.product?.price, "149");
  assert(result.result.evidenceHash?.startsWith("sha256:"));
});

Deno.test("acquireWithZyte supports an explicit extraction profile", async () => {
  let requestBody = "";
  const result = await acquireWithZyte(
    "https://example.test/article",
    "test-key",
    async (_url, init) => {
      requestBody = String(init?.body ?? "");
      return response({ article: { headline: "Article" } });
    },
    Date.now,
    "article",
    "browserHtmlOnly",
  );
  assertEquals(result.result.status, "success");
  assertEquals(result.profile, "article");
  assertEquals(result.extractFrom, "browserHtmlOnly");
  assertStringIncludes(requestBody, '"article":true');
  assertStringIncludes(requestBody, '"articleOptions":{"extractFrom":"browserHtmlOnly"}');
});
Deno.test("acquireWithZyte accepts the nested product envelope", async () => {
  const result = await acquireWithZyte(
    "https://example.test/item",
    "test-key",
    async () => response({
      product: { name: "Nested item", price: 149, currency: "USD" },
      metadata: { probability: 0.8 },
    }),
  );
  assertEquals(result.result.status, "success");
  assertEquals(result.product?.name, "Nested item");
  assertEquals(result.confidence, 0.8);
  assertStringIncludes(productToEvidenceText(result.product!), "USD 149");
});
Deno.test("acquireWithZyte maps provider HTTP failures to typed outcomes", async () => {
  const rateLimited = await acquireWithZyte(
    "https://example.test/item",
    "test-key",
    async () => response({}, 429),
  );
  assertEquals(rateLimited.result.status, "rate_limited");
  assertEquals(rateLimited.result.retryable, true);

  const unauthorized = await acquireWithZyte(
    "https://example.test/item",
    "test-key",
    async () => response({}, 401),
  );
  assertEquals(unauthorized.result.status, "auth_required");
  assertEquals(unauthorized.result.retryable, false);
});

Deno.test("acquireWithZyte rejects empty keys and invalid URLs before network access", async () => {
  let calls = 0;
  try {
    await acquireWithZyte("https://example.test/item", "", async () => {
      calls += 1;
      return response({});
    });
  } catch (error) {
    assertStringIncludes(String(error), "API key");
  }
  assertEquals(calls, 0);

  let sanitizedRequest = "";
  const sanitized = await acquireWithZyte(
    "https://example.test/item?sid=secret-session&aid=304142&checkin=2026-09-29",
    "test-key",
    async (_url, init) => {
      sanitizedRequest = String(init?.body ?? "");
      return response({ product: { name: "Safe" } });
    },
  );
  assertEquals(sanitized.result.status, "success");
  assert(!sanitizedRequest.includes("sid"));
  assert(!sanitizedRequest.includes("aid"));
  assertStringIncludes(sanitizedRequest, "checkin");
});

Deno.test("acquireWithZyte maps not-found, server errors, and network timeout", async () => {
  const notFound = await acquireWithZyte(
    "https://example.test/item",
    "test-key",
    async () => response({}, 404),
  );
  assertEquals(notFound.result.status, "not_found");
  assertEquals(notFound.result.retryable, false);

  const serverError = await acquireWithZyte(
    "https://example.test/item",
    "test-key",
    async () => response({}, 503),
  );
  assertEquals(serverError.result.status, "unreachable");
  assertEquals(serverError.result.errorCode, "PROVIDER_SERVER_ERROR");
  assertEquals(serverError.result.retryable, true);

  const timeout = await acquireWithZyte(
    "https://example.test/item",
    "test-key",
    async () => {
      throw new DOMException("timed out", "AbortError");
    },
  );
  assertEquals(timeout.result.errorCode, "PROVIDER_TIMEOUT");
  assertEquals(timeout.result.retryable, true);
});

Deno.test("acquireWithZyte rejects an oversized bounded response", async () => {
  const oversized = "x".repeat(512 * 1024);
  const result = await acquireWithZyte(
    "https://example.test/item",
    "test-key",
    async () => new Response(JSON.stringify({ product: { description: oversized } })),
  );
  assertEquals(result.result.status, "invalid_content");
  assertEquals(result.result.errorCode, "EMPTY_PROVIDER_RESPONSE");
});
Deno.test("normalizes structured Product fields without HTML or raw arrays", () => {
  const normalized = normalizeProduct({
    name: " Rack ",
    price: "19.79",
    currency: "USD",
    availability: "InStock",
    sku: "B0BNDHZ378",
    descriptionHtml: "<p>do not persist</p>",
    brand: { name: "Drincarier" },
    aggregateRating: { ratingValue: 4.4, reviewCount: 242 },
    mainImage: { url: "https://example.test/image.jpg?utm_source=x" },
    images: [{ url: "https://example.test/other.jpg" }],
  });
  assertEquals(normalized.name, "Rack");
  assertEquals(normalized.price, "19.79");
  assertEquals(normalized.brand, "Drincarier");
  assertEquals(normalized.rating, "4.4");
  assertEquals(normalized.review_count, "242");
  assertEquals(normalized.main_image, "https://example.test/image.jpg");
  assertEquals(normalized.descriptionHtml, undefined);
  assertEquals((normalized as Record<string, unknown>).images, undefined);
});

Deno.test("acquireWithZyte rejects malformed provider content", async () => {
  const result = await acquireWithZyte(
    "https://example.test/item",
    "test-key",
    async () => new Response("not-json"),
  );
  assertEquals(result.result.status, "invalid_content");
  assertEquals(result.result.errorCode, "INVALID_PROVIDER_JSON");
});
