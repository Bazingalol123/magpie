import { canonicalizeUrl, validateCapture } from "../base44/shared/clip.ts";

function assertEquals(actual: unknown, expected: unknown, message: string) {
  const left = JSON.stringify(actual);
  const right = JSON.stringify(expected);
  if (left !== right) throw new Error(`${message}\nexpected: ${right}\nactual:   ${left}`);
}

Deno.test("capture HTML is bounded below the hosted entity string limit", () => {
  const capture = validateCapture({
    source_url: "https://example.com/camera",
    raw_text: "Nikon D500 DSLR camera body",
    raw_html: `<article>${"x".repeat(50_000)}</article>`,
  });

  assertEquals(capture.raw_html?.length, 12_000, "expected bounded structural evidence");
});

Deno.test("legacy capture payloads default to element mode", () => {
  const capture = validateCapture({
    source_url: "https://example.com/camera",
    raw_text: "Nikon D500 DSLR camera body",
  });

  assertEquals(capture.capture_mode, "element", "legacy payloads must remain compatible");
});

Deno.test("link captures retain a validated containing-page URL", () => {
  const capture = validateCapture({
    source_url: "https://shop.example/cameras/nikon-d500",
    context_url: "https://reviews.example/best-cameras",
    capture_mode: "link",
    raw_text: "Nikon D500 — professional DSLR camera",
    raw_html: "",
  });

  assertEquals(capture.capture_mode, "link", "expected link evidence mode");
  assertEquals(capture.context_url, "https://reviews.example/best-cameras", "expected containing page evidence");
  assertEquals(capture.raw_html, "", "link capture must not require page HTML");
});

Deno.test("unknown capture modes are rejected", () => {
  let message = "";
  try {
    validateCapture({
      source_url: "https://example.com",
      capture_mode: "crawler",
      raw_text: "Fetch everything",
    });
  } catch (error) {
    message = error instanceof Error ? error.message : String(error);
  }
  assertEquals(message, "capture_mode is invalid", "expected a stable validation error");
});

Deno.test("canonicalizeUrl strips tracking params so two visits to the same listing match", () => {
  const first = canonicalizeUrl("https://rentals.example/listing/1234?utm_source=newsletter&utm_medium=email");
  const second = canonicalizeUrl("https://rentals.example/listing/1234?gclid=abc123&fbclid=xyz789");
  assertEquals(first, second, "tracking-param variants of the same listing must canonicalize identically");
});

Deno.test("canonicalizeUrl keeps non-tracking query params that identify content", () => {
  const canonical = canonicalizeUrl("https://rentals.example/search?city=austin&min_price=1000");
  assertEquals(canonical, "https://rentals.example/search?city=austin&min_price=1000", "content-identifying params must be preserved");
});

Deno.test("canonicalizeUrl sorts remaining params so key order does not matter", () => {
  const first = canonicalizeUrl("https://rentals.example/listing?b=2&a=1");
  const second = canonicalizeUrl("https://rentals.example/listing?a=1&b=2");
  assertEquals(first, second, "param order alone must not produce different canonical URLs");
});

Deno.test("canonicalizeUrl drops a trailing slash but preserves the fragment", () => {
  const canonical = canonicalizeUrl("https://rentals.example/listing/1234/#details");
  assertEquals(canonical, "https://rentals.example/listing/1234#details", "trailing slash is noise, but the fragment can carry SPA route state and must survive");
});
