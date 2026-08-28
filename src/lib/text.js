import { parseJson } from "./parsing.js";

export function hostFromUrl(value) {
  try {
    return new URL(value).hostname.replace(/^www\./, "");
  } catch {
    return "source page";
  }
}

export function recordTitle(record) {
  const fields = parseJson(record?.fields_json, {});
  return String(fields.title || fields.name || fields.product || fields.role || Object.values(fields).find(Boolean) || hostFromUrl(record?.source_url));
}

export function truncate(value, maxLength) {
  return value.length > maxLength ? `${value.slice(0, maxLength).trimEnd()}…` : value;
}

export function clipTitle(clip) {
  if (!clip) return "Untitled capture";
  const summary = clip.summary || clip.raw_text || "";
  const first = summary.split(/[\r\n.!?]/).map((item) => item.trim()).find(Boolean);
  return first ? truncate(first, 72) : hostFromUrl(clip.source_url);
}

export function screenshotUrlFor(clip) {
  return clip?.screenshot_id || (typeof clip?.screenshot === "string" ? clip.screenshot : clip?.screenshot?.url) || "";
}

// Cards need a captured screenshot to earn their extra visual weight over a
// dense Table row; a favicon (rendered separately by SourceFavicon) doesn't
// count, only a real clip screenshot does.
export function collectionHasCapturedImages(records, clips) {
  const clipsById = new Map(clips.map((clip) => [clip.id, clip]));
  return records.some((record) => !!screenshotUrlFor(clipsById.get(record.clip_id)));
}
