import { useState } from "react";
import { LoaderCircle, Plus, X } from "lucide-react";

export default function MobileCaptureDialog({ onClose, onSubmit, isSubmitting, error, result, missions, activeMissionId }) {
  const [url, setUrl] = useState("");
  const [note, setNote] = useState("");
  const [intent, setIntent] = useState("reference");
  const [missionId, setMissionId] = useState(activeMissionId || "");
  return (
    <div className="detail-overlay" role="presentation" onMouseDown={onClose}>
      <aside className="detail-panel mobile-capture-panel" role="dialog" aria-modal="true" aria-label="Add a memory" onMouseDown={(event) => event.stopPropagation()}>
        <div className="detail-head"><div><div className="eyebrow"><Plus size={13} /> mobile capture</div><h2>Add something to Magpie</h2></div><button className="icon-button" onClick={onClose} aria-label="Close"><X size={19} /></button></div>
        <p className="mobile-capture-intro">Save a link and why it matters. Magpie will organize it into your workspace.</p>
        <form className="mobile-capture-form" onSubmit={(event) => { event.preventDefault(); onSubmit({ source_url: url, raw_text: note, capture_intent: intent, mission_id: missionId }); }}>
          <label>URL<input type="url" value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://…" required /></label>
          <label>Note<textarea value={note} onChange={(event) => setNote(event.target.value)} placeholder="What should Magpie remember?" rows="5" required /></label>
          <label>Intent<select value={intent} onChange={(event) => setIntent(event.target.value)}><option value="reference">Keep for reference</option><option value="compare">Compare later</option><option value="watch">Watch for changes</option><option value="act">Act on this</option></select></label>
          <label>Save to<select value={missionId} onChange={(event) => setMissionId(event.target.value)}><option value="">Library — no Project</option>{missions.map((mission) => <option value={mission.id} key={mission.id}>{mission.title}</option>)}</select></label>
          {error && <div className="review-error">{error}</div>}
          {result && <div className="refresh-notice success">{result.duplicate ? "This capture was already saved." : result.routing_status === "needs_review" ? "Saved to Nest. Magpie needs a little more information before filing it." : "Saved. Magpie is organizing this capture now."}</div>}
          <button className="primary-button" type="submit" disabled={isSubmitting}>{isSubmitting ? <LoaderCircle className="spin" size={15} /> : <Plus size={15} />} {isSubmitting ? "Saving…" : "Save to workspace"}</button>
        </form>
      </aside>
    </div>
  );
}
