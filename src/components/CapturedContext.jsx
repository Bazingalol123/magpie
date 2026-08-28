import { FileText } from "lucide-react";
import { truncate } from "../lib/text.js";

// clip.summary is AI-generated at capture time; older/failed-routing clips
// may not have one, so this falls back to a short raw-text preview with the
// full captured text always reachable behind a toggle rather than dumping
// the whole raw capture inline.
export default function CapturedContext({ clip }) {
  if (!clip?.raw_text) return null;
  const preview = clip.summary || truncate(clip.raw_text, 240);
  const hasMore = clip.summary || clip.raw_text.length > preview.length;
  const dragEvidence = (event, fallback) => {
    const selected = window.getSelection?.().toString().trim();
    event.dataTransfer.setData("text/plain", selected || fallback);
    event.dataTransfer.effectAllowed = "copy";
  };
  return (
    <div className="clip-context">
      <div><FileText size={14} /> {clip.summary ? "Summary" : "Captured context"}</div>
      <p draggable onDragStart={(event) => dragEvidence(event, preview)} title="Select text, then drag it onto a field">{preview}</p>
      {hasMore && (
        <details className="clip-raw-toggle">
          <summary>View full captured text</summary>
          <p draggable onDragStart={(event) => dragEvidence(event, clip.raw_text)} title="Select text, then drag it onto a field">{clip.raw_text}</p>
        </details>
      )}
    </div>
  );
}
