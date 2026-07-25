import { HttpError } from "./http.ts";
import { parseJsonObject, plainTextFromHtml } from "./clip.ts";
import { getOrNull } from "./service-entities.ts";

export type EnrichmentStatus =
  | "changed"
  | "unchanged"
  | "no_extractable_fields"
  | "suspicious_data"
  | "blocked"
  | "not_found"
  | "rate_limited"
  | "unreachable"
  | "invalid_content";

export type EnrichmentResult = {
  record: any;
  status: EnrichmentStatus;
  changeCount: number;
  checkedAt: string;
  retryable: boolean;
  message: string;
  errorCode: string;
};

type SourceFailureStatus = "blocked" | "not_found" | "rate_limited" | "unreachable" | "invalid_content";
type SourceResult =
  | { ok: true; text: string }
  | { ok: false; status: SourceFailureStatus; retryable: boolean; message: string; errorCode: string };

const FETCH_TIMEOUT_MS = 10_000;
const MAX_SOURCE_BYTES = 1_500_000;
const MONEY_FIELD_NAMES = ["price", "rent", "price_or_value"];
const AUTO_PAUSE_BLOCKED_THRESHOLD = 3;

// A login wall or bot challenge is a stable condition, not a transient fault;
// after three consecutive blocked checks the watch pauses instead of burning
// scheduled checks forever (docs/DECISIONS.md).
export function shouldAutoPauseWatch(status: string, retryable: boolean, failureCount: number) {
  return status === "blocked" && !retryable && failureCount >= AUTO_PAUSE_BLOCKED_THRESHOLD;
}

export async function enrichRecord(base44: any, recordId: string, fetchImpl: typeof fetch = fetch): Promise<EnrichmentResult> {
  const record = await getOrNull(base44.asServiceRole.entities.Record, recordId);
  if (!record) throw new HttpError(404, "Record not found");

  const checkedAt = new Date().toISOString();
  const source = await fetchSource(record.source_url, fetchImpl);
  if (!source.ok) return persistNonSuccess(base44, record, checkedAt, source);

  const existingFields = parseJsonObject(record.fields_json);
  const extraction = extractWatchedFields(existingFields, source.text);
  if (extraction.suspicious) {
    return persistNonSuccess(base44, record, checkedAt, {
      status: "suspicious_data",
      retryable: false,
      errorCode: "SUSPICIOUS_DATA",
      message: "The page returned an implausible value, so Magpie left the candidate unchanged.",
    });
  }
  if (!Object.keys(extraction.fields).length) {
    return persistNonSuccess(base44, record, checkedAt, {
      status: "no_extractable_fields",
      retryable: false,
      errorCode: "NO_EXTRACTABLE_FIELDS",
      message: "The page loaded, but none of this candidate's watched fields could be verified safely.",
    });
  }

  const changes = Object.entries(extraction.fields).filter(([field, value]) => {
    return !equivalentValue(field, existingFields[field], value);
  });
  const status = await persistFieldDiff(base44, record, existingFields, changes, checkedAt, "source-refresh-v2");

  return {
    record,
    status,
    changeCount: changes.length,
    checkedAt,
    retryable: false,
    errorCode: "",
    message: changes.length
      ? `${changes.length} trusted field change${changes.length === 1 ? "" : "s"} detected.`
      : "Source checked successfully; no watched fields changed.",
  };
}

export type RefreshOutcome = {
  status: "updated" | "unchanged" | "suspicious";
  changeCount: number;
  checkedAt: string;
};

// The revisit path: the owner's browser supplies fresh bounded text for a page
// the server may not be able to reach. Same extraction and suspicious-value
// guards as enrichRecord; a suspicious diff mutates nothing.
export async function refreshRecordFromEvidence(base44: any, record: any, text: string): Promise<RefreshOutcome> {
  const checkedAt = new Date().toISOString();
  const existingFields = parseJsonObject(record.fields_json);
  const extraction = extractWatchedFields(existingFields, text);
  if (extraction.suspicious) {
    return { status: "suspicious", changeCount: 0, checkedAt };
  }
  const changes = Object.entries(extraction.fields).filter(([field, value]) => {
    return !equivalentValue(field, existingFields[field], value);
  });
  const status = await persistFieldDiff(base44, record, existingFields, changes, checkedAt, "extension-refresh-v1");
  return { status: status === "changed" ? "updated" : "unchanged", changeCount: changes.length, checkedAt };
}

export async function reactivateWatchesAfterRefresh(service: any, ownerId: string, recordId: string) {
  const watches = await service.WatchRule.filter({ owner_id: ownerId, record_id: recordId }, "-created_date", 5);
  for (const watch of watches) {
    if (watch.owner_id !== ownerId) continue;
    const wasAutoPaused = !watch.active && watch.last_error_code === "AUTO_PAUSED_BLOCKED";
    if (!wasAutoPaused && !Number(watch.failure_count || 0)) continue;
    await service.WatchRule.update(watch.id, {
      failure_count: 0,
      last_error_code: "",
      ...(wasAutoPaused
        ? { active: true, next_check_at: new Date(Date.now() + 24 * 60 * 60 * 1_000).toISOString() }
        : {}),
    });
  }
}

async function persistFieldDiff(
  base44: any,
  record: any,
  existingFields: Record<string, unknown>,
  changes: Array<[string, unknown]>,
  checkedAt: string,
  agentId: string,
): Promise<EnrichmentStatus> {
  const nextFields = changes.length ? { ...existingFields, ...Object.fromEntries(changes) } : existingFields;
  const status: EnrichmentStatus = changes.length ? "changed" : "unchanged";
  const update: Record<string, unknown> = {
    fields_json: JSON.stringify(nextFields),
    last_check_at: checkedAt,
    last_enriched_at: checkedAt,
    enrichment_status: status,
    enrichment_error_code: "",
    enrichment_error_message: "",
    consecutive_check_failures: 0,
    freshness: "fresh",
  };
  if (changes.length) update.last_changed_at = checkedAt;

  await base44.asServiceRole.entities.Record.update(record.id, update);
  if (changes.length) {
    await base44.asServiceRole.entities.Enrichment.bulkCreate(changes.map(([field, value]) => ({
      owner_id: record.owner_id,
      record_id: record.id,
      field,
      old_value: String(existingFields[field] ?? ""),
      new_value: String(value),
      checked_at: checkedAt,
      agent_id: agentId,
    })));
  }
  return status;
}

async function fetchSource(sourceUrl: string, fetchImpl: typeof fetch): Promise<SourceResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetchImpl(sourceUrl, {
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "Accept": "text/html,application/xhtml+xml,text/plain;q=0.8",
        "User-Agent": "MagpieWatch/2.0 (+https://magpie.local)",
      },
    });
  } catch (error) {
    return error instanceof DOMException && error.name === "AbortError"
      ? sourceFailure("unreachable", true, "SOURCE_TIMEOUT", "The source did not respond in time.")
      : sourceFailure("unreachable", true, "SOURCE_NETWORK_ERROR", "The source could not be reached.");
  } finally {
    clearTimeout(timeout);
  }

  if (response.status === 401 || response.status === 403) {
    return sourceFailure("blocked", false, "SOURCE_ACCESS_DENIED", "The source requires access Magpie does not have.");
  }
  if (response.status === 404 || response.status === 410) {
    return sourceFailure("not_found", false, "SOURCE_NOT_FOUND", "The source page is no longer available.");
  }
  if (response.status === 429) {
    return sourceFailure("rate_limited", true, "SOURCE_RATE_LIMITED", "The source is temporarily rate-limiting checks.");
  }
  if (response.status >= 500) {
    return sourceFailure("unreachable", true, "SOURCE_UPSTREAM_ERROR", "The source is temporarily unavailable.");
  }
  if (!response.ok) {
    return sourceFailure("invalid_content", false, `SOURCE_HTTP_${response.status}`, "The source returned an unsupported response.");
  }

  const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
  if (contentType && !contentType.includes("text/html") && !contentType.includes("application/xhtml+xml") && !contentType.includes("text/plain")) {
    return sourceFailure("invalid_content", false, "SOURCE_CONTENT_TYPE", "The source did not return a readable web page.");
  }
  const declaredLength = Number(response.headers.get("content-length") || 0);
  if (declaredLength > MAX_SOURCE_BYTES) {
    return sourceFailure("invalid_content", false, "SOURCE_TOO_LARGE", "The source page is too large to verify safely.");
  }

  const html = await response.text();
  if (html.length > MAX_SOURCE_BYTES) {
    return sourceFailure("invalid_content", false, "SOURCE_TOO_LARGE", "The source page is too large to verify safely.");
  }
  const text = plainTextFromHtml(html);
  if (text.length < 40) {
    return sourceFailure("invalid_content", true, "SOURCE_EMPTY", "The source returned too little readable content.");
  }

  const finalUrl = new URL(response.url || sourceUrl);
  const redirectedToAuth = /\/(?:login|signin|auth)(?:\/|$|\?)/i.test(finalUrl.pathname);
  const blockedContent = /captcha|verify (?:that )?you are human|checking your browser|cf-chl-|access denied|robot check|sign in to continue|log in to continue/i.test(`${html.slice(0, 50_000)} ${text.slice(0, 10_000)}`);
  if (redirectedToAuth || blockedContent) {
    return sourceFailure("blocked", false, "SOURCE_CHALLENGE", "The source redirected to a login or anti-bot challenge.");
  }
  if (/page not found|listing (?:is )?no longer available|this item is no longer available|this job is no longer available/i.test(text.slice(0, 20_000))) {
    return sourceFailure("not_found", false, "SOURCE_REMOVED", "The source indicates this candidate is no longer available.");
  }

  return { ok: true, text };
}

function extractWatchedFields(existing: Record<string, unknown>, text: string) {
  const fields: Record<string, string> = {};
  let suspicious = false;

  for (const field of MONEY_FIELD_NAMES) {
    if (!(field in existing)) continue;
    const selected = selectMoneyValue(String(existing[field] ?? ""), text);
    if (selected.suspicious) suspicious = true;
    if (selected.value) fields[field] = selected.value;
  }
  if ("availability" in existing) {
    const unavailable = /out of stock|sold out|currently unavailable|no longer available/i.test(text);
    const available = /in stock|available now|add to cart|ready to ship/i.test(text);
    if (unavailable !== available) fields.availability = unavailable ? "Out of stock" : "In stock";
  }
  return { fields, suspicious };
}

function selectMoneyValue(existingValue: string, text: string) {
  const matches = [...text.matchAll(/(?:US\$|USD|EUR|GBP|ILS|[$€£₪])\s?\d{1,3}(?:[,\s]\d{3})*(?:[.]\d{1,2})?/gi)]
    .map((match) => match[0].replace(/\s+/g, " ").trim())
    .slice(0, 100);
  if (!matches.length) return { value: "", suspicious: false };

  const existingNumber = numericValue(existingValue);
  if (!existingNumber) return { value: matches[0], suspicious: matches.length > 1 };
  const ranked = matches
    .map((value) => ({ value, number: numericValue(value) }))
    .filter((item): item is { value: string; number: number } => Boolean(item.number))
    .sort((a, b) => Math.abs(a.number - existingNumber) - Math.abs(b.number - existingNumber));
  if (!ranked.length) return { value: "", suspicious: false };

  const ratio = ranked[0].number / existingNumber;
  return ratio < 0.25 || ratio > 4
    ? { value: "", suspicious: true }
    : { value: ranked[0].value, suspicious: false };
}

function equivalentValue(field: string, previous: unknown, next: unknown) {
  if (MONEY_FIELD_NAMES.includes(field)) {
    const previousNumber = numericValue(String(previous ?? ""));
    const nextNumber = numericValue(String(next ?? ""));
    if (previousNumber && nextNumber) return previousNumber === nextNumber;
  }
  return String(previous ?? "").trim().toLowerCase() === String(next ?? "").trim().toLowerCase();
}

function numericValue(value: string) {
  const parsed = Number(value.replace(/[^\d.,]/g, "").replace(/,/g, ""));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

async function persistNonSuccess(
  base44: any,
  record: any,
  checkedAt: string,
  outcome: { status: Exclude<EnrichmentStatus, "changed" | "unchanged">; retryable: boolean; message: string; errorCode: string },
): Promise<EnrichmentResult> {
  const failures = Number(record.consecutive_check_failures || 0) + 1;
  const freshness = outcome.status === "blocked"
    ? "blocked"
    : outcome.status === "unreachable"
      ? "unreachable"
      : "stale";
  await base44.asServiceRole.entities.Record.update(record.id, {
    last_check_at: checkedAt,
    enrichment_status: outcome.status,
    enrichment_error_code: outcome.errorCode,
    enrichment_error_message: outcome.message,
    consecutive_check_failures: failures,
    freshness,
    next_action: nextActionFor(outcome.status),
  });
  return {
    record,
    status: outcome.status,
    changeCount: 0,
    checkedAt,
    retryable: outcome.retryable,
    message: outcome.message,
    errorCode: outcome.errorCode,
  };
}

function sourceFailure(status: SourceFailureStatus, retryable: boolean, errorCode: string, message: string): SourceResult {
  return { ok: false, status, retryable, errorCode, message };
}

function nextActionFor(status: Exclude<EnrichmentStatus, "changed" | "unchanged">) {
  switch (status) {
    case "blocked":
      return "Open the source in your browser and recapture it with the extension.";
    case "not_found":
      return "Confirm whether this candidate is closed, removed, or unavailable.";
    case "rate_limited":
      return "Wait before checking this source again.";
    case "unreachable":
      return "Retry later; the source could not be reached.";
    case "suspicious_data":
      return "Review the source manually; Magpie ignored an implausible value.";
    default:
      return "Review this candidate manually; the source could not be verified safely.";
  }
}
