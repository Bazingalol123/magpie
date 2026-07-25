import { createClientFromRequest } from "npm:@base44/sdk";
import { requireExtensionPrincipal } from "../../shared/auth.ts";
import {
  reactivateWatchesAfterRefresh,
  refreshRecordFromEvidence,
} from "../../shared/enrichment-v2.ts";
import { corsHeaders, errorResponse, HttpError, json, readJson, requirePost } from "../../shared/http.ts";

const MAX_TEXT_LENGTH = 20_000;

Deno.serve(async (req) => {
  try {
    if (requirePost(req)) return new Response(null, { status: 204, headers: corsHeaders });

    const base44 = createClientFromRequest(req);
    const { ownerId } = await requireExtensionPrincipal(base44, req);
    const input = await readJson(req);

    const sourceUrl = validHttpUrl(input.source_url);
    if (!sourceUrl) throw new HttpError(400, "source_url must be a valid http(s) URL");
    if (typeof input.raw_text !== "string" || !input.raw_text.trim()) {
      throw new HttpError(400, "raw_text is required");
    }
    const text = input.raw_text.trim().slice(0, MAX_TEXT_LENGTH);

    const service = base44.asServiceRole.entities;
    const records = await service.Record.filter(
      { owner_id: ownerId, source_url: sourceUrl },
      "-created_date",
      1,
    );
    const record = records[0];
    if (!record || record.owner_id !== ownerId) {
      return json({ outcome: "no_match" });
    }

    const result = await refreshRecordFromEvidence(base44, record, text);
    if (result.status !== "suspicious") {
      await reactivateWatchesAfterRefresh(service, ownerId, record.id);
    }

    return json({
      outcome: result.status,
      change_count: result.changeCount,
      checked_at: result.checkedAt,
    });
  } catch (error) {
    return errorResponse(error);
  }
});

function validHttpUrl(value: unknown) {
  if (typeof value !== "string") return "";
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:" ? value : "";
  } catch {
    return "";
  }
}
