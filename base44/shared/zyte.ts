import type { AcquisitionResult } from "./refresh-contracts.ts";

const ZYTE_ENDPOINT = "https://api.zyte.com/v1/extract";
const MAX_RESPONSE_BYTES = 512 * 1024;
const DEFAULT_TIMEOUT_MS = 30_000;

export type ZyteExtractionProfile = "product" | "article" | "jobPosting" | "review";
export type ZyteExtractionSource = "httpResponseBody" | "browserHtmlOnly" | "browserHtml" | "userHtml";
export type ZyteProduct = {
  name?: string;
  price?: string;
  currency?: string;
  currencyRaw?: string;
  sku?: string;
  description?: string;
  mainImage?: { url?: string };
  url?: string;
  canonicalUrl?: string;
  metadata?: { probability?: number; dateDownloaded?: string };
  [key: string]: unknown;
};

export type ZyteAcquisition = {
  result: AcquisitionResult;
  profile?: ZyteExtractionProfile;
  extractFrom?: ZyteExtractionSource;
  product?: ZyteProduct;
  canonicalUrl?: string;
  downloadedAt?: string;
  confidence?: number;
  durationMs: number;
  responseStatus?: number;
  responseContentType?: string;
  responseContentLength?: string;
  responseBodyAvailable?: boolean;
  responseBodyBytes?: number;
};

export async function acquireWithZyte(
  sourceUrl: string,
  apiKey: string,
  fetchImpl: typeof fetch = fetch,
  now: () => number = Date.now,
  profile: ZyteExtractionProfile = "product",
  extractFrom: ZyteExtractionSource = "httpResponseBody",
): Promise<ZyteAcquisition> {
  const startedAt = now();
  const safeSourceUrl = sanitizeSourceUrl(sourceUrl);
  if (!safeSourceUrl) {
    throw new Error("sourceUrl must be a safe http(s) URL");
  }
  if (!apiKey.trim()) throw new Error("Zyte API key is required");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetchImpl(ZYTE_ENDPOINT, {
      method: "POST",
      headers: {
        "Authorization": `Basic ${btoa(`${apiKey}:`)}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        url: safeSourceUrl,
        [profile]: true,
        followRedirect: true,
        [`${profile}Options`]: { extractFrom },
      }),
      signal: controller.signal,
    });
  } catch (error) {
    clearTimeout(timeout);
    return {
      result: {
        status: error instanceof DOMException && error.name === "AbortError"
          ? "unreachable"
          : "unreachable",
        strategy: "zyte",
        retryable: true,
        errorCode: error instanceof DOMException && error.name === "AbortError"
          ? "PROVIDER_TIMEOUT"
          : "PROVIDER_NETWORK_ERROR",
      },
      durationMs: boundedDuration(now() - startedAt),
    };
  } finally {
    clearTimeout(timeout);
  }

  const responseBodyAvailable = Boolean(response.body);
  const responseContentType = response.headers.get("content-type") ?? undefined;
  const responseContentLength = response.headers.get("content-length") ?? undefined;
  const providerRequestId = response.headers.get("x-zyte-request-id") ||
    undefined;
  if (!response.ok) {
    return {
      result: mapHttpFailure(response.status, providerRequestId),
      durationMs: boundedDuration(now() - startedAt),
    };
  }

  const bodyTimeout = setTimeout(
    () => controller.abort(),
    Math.max(DEFAULT_TIMEOUT_MS - (now() - startedAt), 1),
  );
  let body: string;
  let responseBodyBytes: number | undefined;
  try {
    const bodyResult = await boundedText(response, MAX_RESPONSE_BYTES, controller.signal);
    body = bodyResult.text;
    responseBodyBytes = bodyResult.bytes;
  } catch (error) {
    return {
      result: {
        status: "unreachable",
        strategy: "zyte",
        retryable: true,
        errorCode: error instanceof DOMException && error.name === "AbortError"
          ? "PROVIDER_TIMEOUT"
          : "PROVIDER_BODY_ERROR",
        providerRequestId,
      },
      durationMs: boundedDuration(now() - startedAt),
    };
  } finally {
    clearTimeout(bodyTimeout);
  }
  if (!body) {
    return {
      result: {
        status: "invalid_content",
        strategy: "zyte",
        retryable: false,
        errorCode: "EMPTY_PROVIDER_RESPONSE",
        providerRequestId,
      },
      responseStatus: response.status,
      responseContentType,
      responseContentLength,
      responseBodyAvailable,
      responseBodyBytes,
      durationMs: boundedDuration(now() - startedAt),
    };
  }

  let payload: unknown;
  try {
    payload = JSON.parse(body);
  } catch {
    return {
      result: {
        status: "invalid_content",
        strategy: "zyte",
        retryable: false,
        errorCode: "INVALID_PROVIDER_JSON",
        providerRequestId,
      },
      durationMs: boundedDuration(now() - startedAt),
    };
  }

  const envelope = objectValue(payload);
  const profilePayload = objectValue(envelope?.[profile]);
  const product = profilePayload ?? objectValue(envelope?.product) ?? envelope;
  if (!product) {
    return {
      result: {
        status: "invalid_content",
        strategy: "zyte",
        retryable: false,
        errorCode: "MISSING_PRODUCT_DATA",
        providerRequestId,
      },
      durationMs: boundedDuration(now() - startedAt),
    };
  }

  const evidenceHash = await sha256(body);
  const metadata = objectValue(product.metadata) ?? objectValue(envelope?.metadata);
  const confidence = typeof metadata?.probability === "number" &&
      Number.isFinite(metadata.probability)
    ? Math.min(Math.max(metadata.probability, 0), 1)
    : undefined;
  const safeCanonicalUrl = typeof product.canonicalUrl === "string"
    ? sanitizeSourceUrl(product.canonicalUrl)
    : null;
  const canonicalUrl = safeCanonicalUrl ?? undefined;
  const downloadedAt = typeof metadata?.dateDownloaded === "string"
    ? metadata.dateDownloaded
    : undefined;

  return {
    result: {
      status: "success",
      strategy: "zyte",
      retryable: false,
      providerRequestId,
      evidenceHash,
    },
    profile,
    extractFrom,
    product: product as ZyteProduct,
    canonicalUrl,
    downloadedAt,
    confidence,
    durationMs: boundedDuration(now() - startedAt),
  };
}

export type NormalizedProduct = {
  name?: string;
  price?: string;
  currency?: string;
  availability?: string;
  sku?: string;
  description?: string;
  brand?: string;
  rating?: string;
  review_count?: string;
  main_image?: string;
  canonical_url?: string;
  [key: string]: unknown;
};

export function normalizeProduct(product: ZyteProduct): NormalizedProduct {
  const normalized: NormalizedProduct = {};
  for (const key of ["name", "availability", "sku", "description"] as const) {
    const value = product[key];
    if (typeof value === "string" && value.trim()) normalized[key] = value.trim().slice(0, 4_000);
  }
  if (typeof product.price === "string" || typeof product.price === "number") {
    const value = String(product.price).trim();
    if (value) normalized.price = value.slice(0, 200);
  }
  if (typeof product.currency === "string" && product.currency.trim()) normalized.currency = product.currency.trim().slice(0, 16);
  const brand = objectValue(product.brand)?.name;
  if (typeof brand === "string" && brand.trim()) normalized.brand = brand.trim().slice(0, 200);
  const rating = objectValue(product.aggregateRating)?.ratingValue;
  if (typeof rating === "number" && Number.isFinite(rating)) normalized.rating = String(rating);
  const reviewCount = objectValue(product.aggregateRating)?.reviewCount;
  if (typeof reviewCount === "number" && Number.isFinite(reviewCount)) normalized.review_count = String(reviewCount);
  const image = objectValue(product.mainImage)?.url;
  if (typeof image === "string") normalized.main_image = sanitizeSourceUrl(image) ?? undefined;
  normalized.canonical_url = sanitizeSourceUrl(product.canonicalUrl ?? product.url) ?? undefined;
  return normalized;
}

export function productToEvidenceText(product: ZyteProduct) {
  const fields: Record<string, string> = {};
  for (const key of ["name", "sku", "description", "availability"]) {
    const value = product[key];
    if (typeof value === "string" && value.trim()) {
      fields[key] = value.trim().slice(0, 4_000);
    }
  }
  const price = product.price;
  const currency = typeof product.currency === "string"
    ? product.currency
    : typeof product.currencyRaw === "string"
    ? product.currencyRaw
    : "";
  if ((typeof price === "string" || typeof price === "number") && String(price).trim()) {
    fields.price = `${currency} ${String(price)}`.trim().slice(0, 200);
  }
  return Object.keys(fields).length ? JSON.stringify(fields) : "";
}

function mapHttpFailure(
  status: number,
  providerRequestId?: string,
): AcquisitionResult {
  if (status === 401 || status === 403) {
    return {
      status: "auth_required",
      strategy: "zyte",
      retryable: false,
      errorCode: "PROVIDER_AUTH",
      providerRequestId,
    };
  }
  if (status === 404) {
    return {
      status: "not_found",
      strategy: "zyte",
      retryable: false,
      errorCode: "SOURCE_NOT_FOUND",
      providerRequestId,
    };
  }
  if (status === 429) {
    return {
      status: "rate_limited",
      strategy: "zyte",
      retryable: true,
      errorCode: "PROVIDER_RATE_LIMITED",
      providerRequestId,
    };
  }
  if (status >= 500) {
    return {
      status: "unreachable",
      strategy: "zyte",
      retryable: true,
      errorCode: "PROVIDER_SERVER_ERROR",
      providerRequestId,
    };
  }
  return {
    status: "invalid_content",
    strategy: "zyte",
    retryable: false,
    errorCode: `PROVIDER_HTTP_${status}`,
    providerRequestId,
  };
}

async function readChunk(reader: ReadableStreamDefaultReader<Uint8Array>, signal: AbortSignal) {
  if (signal.aborted) throw new DOMException("Provider response timed out", "AbortError");
  return await Promise.race([
    reader.read(),
    new Promise<never>((_, reject) => {
      signal.addEventListener(
        "abort",
        () => reject(new DOMException("Provider response timed out", "AbortError")),
        { once: true },
      );
    }),
  ]);
}

async function boundedText(
  response: Response,
  maxBytes: number,
  signal: AbortSignal,
): Promise<{ text: string; bytes: number }> {
  const reader = response.body?.getReader();
  if (!reader) return { text: "", bytes: 0 };
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (total <= maxBytes) {
      const next = await readChunk(reader, signal);
      if (next.done) break;
      total += next.value.byteLength;
      if (total > maxBytes) return { text: "", bytes: total };
      chunks.push(next.value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return { text: new TextDecoder().decode(bytes), bytes: total };
}

function objectValue(value: unknown): Record<string, any> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, any>
    : null;
}

function sanitizeSourceUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    if (url.username || url.password) return null;
    for (const key of [...url.searchParams.keys()]) {
      if (/^(?:sid|session|token|auth|password|passwd|cookie|secret|api[_-]?key)$/i.test(key)) {
        url.searchParams.delete(key);
        continue;
      }
      if (/^(?:utm_[^=]+|fbclid|gclid|aid|label|srepoch|srpvid|hapos|hpos)$/i.test(key)) {
        url.searchParams.delete(key);
      }
    }
    return url.toString();
  } catch {
    return null;
  }
}

function boundedDuration(value: number) {
  return Math.min(
    Math.max(Math.round(Number.isFinite(value) ? value : 0), 0),
    600_000,
  );
}

async function sha256(value: string) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return `sha256:${
    Array.from(new Uint8Array(digest), (byte) =>
      byte.toString(16).padStart(2, "0")).join("")
  }`;
}
