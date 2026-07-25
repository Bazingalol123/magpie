import { HttpError } from "./http.ts";

// Base44 entity strings reject very large HTML fragments. The screenshot and
// raw text preserve evidence; this bounded fragment is only structural context.
const MAX_RAW_HTML_LENGTH = 12_000;
const MAX_RAW_TEXT_LENGTH = 20_000;
export const CAPTURE_MODES = ["element", "selection", "page", "link", "visual", "image"] as const;
export type CaptureMode = typeof CAPTURE_MODES[number];

export type CapturePayload = {
  source_url: string;
  context_url?: string;
  capture_mode: CaptureMode;
  raw_html?: string;
  raw_text: string;
  screenshot_id?: string;
  screenshot_data_url?: string;
  captured_at?: string;
  mission_id?: string;
  capture_intent?: "compare" | "watch" | "act" | "reference";
  idempotency_key?: string;
};

export function validateCapture(payload: unknown): CapturePayload {
  if (!payload || typeof payload !== "object") {
    throw new HttpError(400, "Capture payload is required");
  }

  const capture = payload as Record<string, unknown>;
  if (typeof capture.source_url !== "string" || !isHttpUrl(capture.source_url)) {
    throw new HttpError(400, "source_url must be an http or https URL");
  }
  if (typeof capture.raw_text !== "string" || !capture.raw_text.trim()) {
    throw new HttpError(400, "raw_text is required");
  }
  if (capture.context_url !== undefined && (typeof capture.context_url !== "string" || !isHttpUrl(capture.context_url))) {
    throw new HttpError(400, "context_url must be an http or https URL");
  }
  if (capture.capture_mode !== undefined && !isCaptureMode(capture.capture_mode)) {
    throw new HttpError(400, "capture_mode is invalid");
  }

  if (typeof capture.screenshot_data_url === "string" && capture.screenshot_data_url.length > 3_000_000) {
    throw new HttpError(413, "screenshot_data_url is too large");
  }

  return {
    source_url: capture.source_url,
    context_url: typeof capture.context_url === "string" ? capture.context_url : undefined,
    capture_mode: isCaptureMode(capture.capture_mode) ? capture.capture_mode : "element",
    raw_html: typeof capture.raw_html === "string" ? capture.raw_html.slice(0, MAX_RAW_HTML_LENGTH) : "",
    raw_text: capture.raw_text.trim().slice(0, MAX_RAW_TEXT_LENGTH),
    screenshot_id: typeof capture.screenshot_id === "string" ? capture.screenshot_id : undefined,
    screenshot_data_url: typeof capture.screenshot_data_url === "string" ? capture.screenshot_data_url : undefined,
    captured_at: typeof capture.captured_at === "string" ? capture.captured_at : new Date().toISOString(),
    mission_id: boundedString(capture.mission_id, 80),
    capture_intent: isCaptureIntent(capture.capture_intent) ? capture.capture_intent : "compare",
    idempotency_key: boundedString(capture.idempotency_key, 120),
  };
}

export function screenshotFile(dataUrl: string | undefined) {
  if (!dataUrl) return undefined;
  const match = dataUrl.match(/^data:(image\/(?:jpeg|png));base64,([a-zA-Z0-9+/=]+)$/);
  if (!match) throw new HttpError(400, "screenshot_data_url must be a PNG or JPEG data URL");

  const binary = atob(match[2]);
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  return new File([bytes], `magpie-capture.${match[1] === "image/png" ? "png" : "jpg"}`, { type: match[1] });
}

export function parseJsonObject(value: string | undefined) {
  if (!value) return {} as Record<string, unknown>;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : {};
  } catch {
    return {} as Record<string, unknown>;
  }
}

export function plainTextFromHtml(html: string) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isHttpUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function boundedString(value: unknown, maxLength: number) {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, maxLength) : undefined;
}

function isCaptureIntent(value: unknown): value is CapturePayload["capture_intent"] {
  return value === "compare" || value === "watch" || value === "act" || value === "reference";
}

function isCaptureMode(value: unknown): value is CaptureMode {
  return CAPTURE_MODES.some((mode) => mode === value);
}
