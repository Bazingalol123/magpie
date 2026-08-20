import { createClientFromRequest } from "npm:@base44/sdk";
import { requireUser } from "../../shared/auth.ts";
import { canonicalizeUrl, validateCapture } from "../../shared/clip.ts";
import { getOrNull } from "../../shared/service-entities.ts";
import { corsHeaders, errorResponse, json, readJson, requirePost, HttpError } from "../../shared/http.ts";
import { processStoredClip } from "../../shared/routing-persistence.ts";

Deno.serve(async (req) => {
  try {
    if (requirePost(req)) return new Response(null, { status: 204, headers: corsHeaders });
    const base44 = createClientFromRequest(req);
    const user = await requireUser(base44);
    const input = await readJson(req);
    const capture = validateCapture({
      ...(input as Record<string, unknown>),
      capture_mode: "page",
      raw_html: "",
    });
    if (capture.mission_id) {
      const mission = await getOrNull(base44.asServiceRole.entities.Mission, capture.mission_id);
      if (!mission || mission.owner_id !== user.id || mission.status !== "active") {
        throw new HttpError(409, "The selected Project is unavailable");
      }
    }
    const canonicalUrl = canonicalizeUrl(capture.source_url);
    const idempotencyKey = capture.idempotency_key ?? await sha256(`${user.id}\n${canonicalUrl}\n${capture.raw_text}`);
    const existing = await base44.asServiceRole.entities.Clip.filter({
      owner_id: user.id,
      idempotency_key: idempotencyKey,
    }, "-created_date", 1);
    if (existing[0]) {
      return json({ accepted: true, duplicate: true, clip_id: existing[0].id, routing_status: existing[0].routing_status }, 202);
    }
    const contentHash = await sha256(`${capture.capture_mode}\n${canonicalUrl}\n${capture.raw_text.replace(/\s+/g, " ").trim()}`);
    const clip = await base44.asServiceRole.entities.Clip.create({
      owner_id: user.id,
      source_url: capture.source_url,
      canonical_url: canonicalUrl,
      capture_mode: "page",
      raw_html: "",
      raw_text: capture.raw_text,
      captured_at: capture.captured_at,
      mission_id: capture.mission_id,
      capture_intent: capture.capture_intent,
      idempotency_key: idempotencyKey,
      content_hash: contentHash,
      attempt_count: 0,
      status: "queued",
      routing_status: "pending",
    });
    const result = await processStoredClip(base44, clip.id);
    return json({ accepted: true, duplicate: false, clip_id: clip.id, routing_status: result.clip.routing_status }, 202);
  } catch (error) {
    return errorResponse(error, req);
  }
});

async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}
