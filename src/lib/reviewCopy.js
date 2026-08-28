export const REASON_LABELS = {
  ai_unavailable: "Organization was temporarily unavailable",
  malformed_ai_response: "Magpie could not understand this page",
  ambiguous_candidates: "More than one possible type matched",
  mixed_content: "The capture mixed more than one type of content",
  invalid_schema: "The proposed fields were not usable",
  unsafe_collection_name: "Magpie could not create a safe Collection name",
  unsupported_schema: "Magpie could not create a safe Collection shape",
  insufficient_supported_fields: "Not enough usable details were captured",
  low_confidence: "Magpie was not confident enough to file this automatically",
  inactive_collection: "The matching Collection is archived",
  cross_owner_candidate: "The matched Collection was not eligible",
  ineligible_scope: "The matched Collection was out of scope",
};

export function reasonLabel(code) {
  return REASON_LABELS[code] || "Magpie was not confident enough to organize this automatically";
}

export const CAPTURE_MODE_LABELS = {
  element: "Clip Element",
  selection: "Text Selection",
  page: "Save Page",
  link: "Link Capture",
  visual: "Snip Area",
  image: "Image Capture",
};

export function signalTypeFor(record, enrichment) {
  if (enrichment?.agent_id === "extension-refresh-v1") return "revisit";
  if (enrichment) return "changed";
  if (record?.freshness === "blocked") return "blocked";
  if (record?.freshness === "unreachable") return "error";
  return "changed";
}
