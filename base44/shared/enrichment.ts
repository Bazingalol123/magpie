import { HttpError } from "./http.ts";
import { parseJsonObject, plainTextFromHtml } from "./clip.ts";

export async function enrichRecord(base44: any, recordId: string) {
  const record = await base44.asServiceRole.entities.Record.get(recordId);
  if (!record) throw new HttpError(404, "Record not found");

  const response = await fetch(record.source_url, {
    headers: { "User-Agent": "MagpieWatch/1.0 (+https://magpie.local)" },
  });
  if (!response.ok) throw new HttpError(502, "Could not refresh the source page");

  const html = await response.text();
  const sourceText = plainTextFromHtml(html);
  const existingFields = parseJsonObject(record.fields_json);
  const extractedFields = extractWatchedFields(existingFields, html, sourceText);
  const changes = Object.entries(extractedFields).filter(([field, value]) => {
    return String(existingFields[field] ?? "") !== String(value);
  });
  const checkedAt = new Date().toISOString();

  if (changes.length) {
    const nextFields = { ...existingFields, ...extractedFields };
    await base44.asServiceRole.entities.Record.update(record.id, {
      fields_json: JSON.stringify(nextFields),
      last_enriched_at: checkedAt,
    });
    await base44.asServiceRole.entities.Enrichment.bulkCreate(changes.map(([field, value]) => ({
      owner_id: record.owner_id,
      record_id: record.id,
      field,
      old_value: String(existingFields[field] ?? ""),
      new_value: String(value),
      checked_at: checkedAt,
      agent_id: "source-refresh-v1",
    })));
  } else {
    await base44.asServiceRole.entities.Record.update(record.id, { last_enriched_at: checkedAt });
  }

  return { record, changeCount: changes.length, checkedAt };
}

function extractWatchedFields(existing: Record<string, unknown>, html: string, text: string) {
  const next: Record<string, string> = {};
  if ("title" in existing) {
    const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.replace(/\s+/g, " ").trim();
    if (title) next.title = title;
  }
  if ("price" in existing) {
    const price = text.match(/(?:US\$|[$€£])\s?\d{1,3}(?:[,.]\d{3})*(?:[,.]\d{2})?/i)?.[0];
    if (price) next.price = price;
  }
  if ("availability" in existing) {
    const availability = /out of stock|sold out|unavailable/i.test(text)
      ? "Out of stock"
      : /in stock|available now|add to cart/i.test(text)
        ? "In stock"
        : undefined;
    if (availability) next.availability = availability;
  }
  return next;
}
