import { useRef, useState } from "react";
import { ArrowRightLeft, Check, FolderPlus, LoaderCircle } from "lucide-react";
import { parseJson } from "../../lib/parsing.js";
import { relativeDate } from "../../lib/dates.js";
import { clipTitle, hostFromUrl, screenshotUrlFor } from "../../lib/text.js";
import { reasonLabel, CAPTURE_MODE_LABELS } from "../../lib/reviewCopy.js";
import SourceFavicon from "../../components/SourceFavicon.jsx";

export default function NestCard({ clip, decision, collections, onResolve, onOpenAdvanced, isBusy }) {
  const [showMove, setShowMove] = useState(false);
  const [moveTo, setMoveTo] = useState("");
  const [confirmDismiss, setConfirmDismiss] = useState(false);
  const touchStart = useRef(null);
  const reasons = parseJson(decision?.reason_codes_json, []).filter(Boolean);
  const primaryReason = reasons[0] || clip.routing_reason_code || "low_confidence";
  const isAgentOutage = primaryReason === "ai_unavailable" || primaryReason === "malformed_ai_response";
  const confidence = typeof decision?.confidence === "number" ? decision.confidence : clip.routing_confidence;
  const image = screenshotUrlFor(clip);
  const suggestion = decision?.suggested_name;
  const onTouchStart = (event) => {
    if (event.target.closest("button, select, input")) return;
    const touch = event.changedTouches[0];
    touchStart.current = { x: touch.clientX, y: touch.clientY };
  };
  const onTouchEnd = (event) => {
    if (!touchStart.current || isBusy) return;
    const touch = event.changedTouches[0];
    const dx = touch.clientX - touchStart.current.x;
    const dy = touch.clientY - touchStart.current.y;
    touchStart.current = null;
    if (Math.abs(dx) < 80 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
    if (dx > 0 && suggestion) onResolve(clip.id, { action: "accept", clip_id: clip.id });
    if (dx < 0) setShowMove(true);
  };
  return (
    <article className={`nest-card${isAgentOutage ? " is-error" : ""}`} onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
      <div className="nest-card-media">{image ? <img src={image} alt="" /> : <SourceFavicon url={clip.source_url} large />}</div>
      <div className="nest-card-content">
        <h2>{clipTitle(clip)}</h2>
        <div className="nest-meta"><span>{hostFromUrl(clip.source_url)}</span><span>·</span><span>{relativeDate(clip.captured_at || clip.created_date)}</span><span>·</span><span>{CAPTURE_MODE_LABELS[clip.capture_mode] || "Capture"}</span></div>
        <div className="nest-reason">
          <b>{isAgentOutage ? "The routing agent was unavailable" : reasonLabel(primaryReason)}</b>
          <p>{isAgentOutage
            ? "Nothing was created — your capture is safe and can be routed now."
            : `${reasons.slice(1).map(reasonLabel).join(" · ") || "Magpie kept this out of your Collections instead of guessing."}${typeof confidence === "number" ? ` Confidence ${confidence.toFixed(2)}.` : ""}`}</p>
        </div>
        {showMove && (
          <div className="nest-inline-action">
            <select value={moveTo} onChange={(event) => setMoveTo(event.target.value)} aria-label="Move capture to Collection">
              <option value="">Choose a Collection…</option>
              {collections.map((collection) => <option key={collection.id} value={collection.id}>{collection.name}</option>)}
            </select>
            <button type="button" className="secondary-button" disabled={!moveTo || isBusy} onClick={() => onResolve(clip.id, { action: "redirect", clip_id: clip.id, collection_id: moveTo })}>Move</button>
          </div>
        )}
        <div className="nest-actions">
          {suggestion && <button type="button" className="primary-button" disabled={isBusy} onClick={() => onResolve(clip.id, { action: "accept", clip_id: clip.id })}>{isBusy ? <LoaderCircle className="spin" size={14} /> : <Check size={14} />} Accept · {suggestion}</button>}
          <button type="button" className="secondary-button" onClick={() => setShowMove((current) => !current)}><ArrowRightLeft size={14} /> Move to…</button>
          <button type="button" className="secondary-button" onClick={() => onOpenAdvanced(clip.id)}><FolderPlus size={14} /> Create a Collection</button>
          {confirmDismiss ? (
            <span className="nest-dismiss-confirm"><span>Remove “{clipTitle(clip)}” permanently?</span><button type="button" className="danger-button" disabled={isBusy} onClick={() => onResolve(clip.id, { action: "dismiss", clip_id: clip.id })}>Dismiss</button><button type="button" className="text-button" onClick={() => setConfirmDismiss(false)}>Keep</button></span>
          ) : <button type="button" className="text-button" onClick={() => setConfirmDismiss(true)}>Dismiss</button>}
        </div>
        <small className="nest-swipe-hint">Swipe right to accept · left to choose a Collection</small>
      </div>
    </article>
  );
}
