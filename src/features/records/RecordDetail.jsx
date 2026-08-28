import { useEffect, useState } from "react";
import { Check, ChevronRight, ExternalLink, FileText, LoaderCircle, LockKeyhole, Pause, Pencil, Play, Plus, Radio, RefreshCw, SlidersHorizontal, Trash2, X } from "lucide-react";
import { parseJson, isHttpUrl } from "../../lib/parsing.js";
import { formatDate } from "../../lib/dates.js";
import { hostFromUrl, screenshotUrlFor } from "../../lib/text.js";
import { CHECKING_STAGES } from "../../lib/agentMessages.js";
import { useStagedMessage } from "../../hooks/useStagedMessage.js";
import CapturedContext from "../../components/CapturedContext.jsx";
import FieldValue from "../../components/FieldValue.jsx";

export default function RecordDetail({ record, clip, enrichments, watch, onClose, onRefresh, isRefreshing, onStatus, refreshNotice, onDelete, isDeleting, onToggleWatch, onCreateWatch, isTogglingWatch, onCorrectField }) {
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);
  const [refreshStrategy, setRefreshStrategy] = useState("direct_http");
  const [editingField, setEditingField] = useState(null);
  const [correctionValue, setCorrectionValue] = useState("");
  const [correctionError, setCorrectionError] = useState("");
  const [isCorrecting, setIsCorrecting] = useState(false);
  useEffect(() => {
    setIsConfirmingDelete(false);
    setEditingField(null);
    setCorrectionError("");
  }, [record?.id]);
  const checkingLabel = useStagedMessage(isRefreshing, CHECKING_STAGES);

  if (!record) return null;
  const fields = parseJson(record.fields_json, {});
  const screenshotUrl = screenshotUrlFor(clip);
  const isBlocked = record.freshness === "blocked";
  const isAutoPaused = watch?.last_error_code === "AUTO_PAUSED_BLOCKED" && !watch?.active;
  // Status color, not decoration: a field only carries --status-changed
  // when it has real recorded history, and shows when that last happened.
  const lastChangeByField = new Map();
  for (const item of enrichments) {
    const existing = lastChangeByField.get(item.field);
    if (!existing || new Date(item.checked_at) > new Date(existing.checked_at)) lastChangeByField.set(item.field, item);
  }
  // Changed field(s) lead the list -- "the changed field at the top" --
  // rather than sitting wherever they fall in raw schema order.
  const sortedFieldEntries = Object.entries(fields).sort(
    (a, b) => (lastChangeByField.has(b[0]) ? 1 : 0) - (lastChangeByField.has(a[0]) ? 1 : 0),
  );
  const startCorrection = (name, value, initialValue = value) => {
    setEditingField(name);
    if (typeof value === "number" && typeof initialValue === "string") {
      const numeric = initialValue.replace(/,/g, "").match(/-?\d+(?:\.\d+)?/);
      setCorrectionValue(numeric?.[0] || String(value));
    } else {
      setCorrectionValue(initialValue === null ? "" : String(initialValue));
    }
    setCorrectionError("");
  };
  const dropEvidence = (event, name, value) => {
    if (!(value === null || ["string", "number"].includes(typeof value))) return;
    event.preventDefault();
    const dropped = event.dataTransfer.getData("text/plain").trim();
    if (dropped) startCorrection(name, value, dropped);
  };
  const submitCorrection = async (event, name, currentValue) => {
    event.preventDefault();
    let nextValue = correctionValue;
    if (typeof currentValue === "number") {
      nextValue = Number(correctionValue);
      if (!Number.isFinite(nextValue)) {
        setCorrectionError("Enter a valid number.");
        return;
      }
    } else if (typeof currentValue === "boolean") {
      nextValue = correctionValue === "true";
    }
    setIsCorrecting(true);
    setCorrectionError("");
    try {
      await onCorrectField(name, currentValue, nextValue);
      setEditingField(null);
    } catch (error) {
      setCorrectionError(error.response?.data?.error || error.message || "Could not save this correction.");
    } finally {
      setIsCorrecting(false);
    }
  };
  return (
    <div className="detail-overlay" role="presentation" onMouseDown={onClose}>
      <aside className="detail-panel detail-panel-split" role="dialog" aria-modal="true" aria-label="Item detail" onMouseDown={(event) => event.stopPropagation()}>
        <div className="detail-head">
          <div><div className="eyebrow">original context + live fields</div><h2 dir="auto">{fields.title || hostFromUrl(record.source_url)}</h2></div>
          <button className="icon-button" onClick={onClose} aria-label="Close"><X size={19} /></button>
        </div>
        <div className="detail-split">
          <section className="detail-evidence-pane" aria-label="Captured evidence">
            <div className="detail-section-label">Evidence</div>
            {isHttpUrl(record.source_url) && <a className="source-link" href={record.source_url} target="_blank" rel="noreferrer"><ExternalLink size={14} /> {hostFromUrl(record.source_url)}</a>}
            {screenshotUrl ? <img className="clip-screenshot" src={screenshotUrl} alt="Captured source page" /> : <div className="detail-evidence-empty"><FileText size={18} /> No screenshot was captured for this Item.</div>}
            <CapturedContext clip={clip} />
          </section>
          <section className="detail-fields-pane" aria-label="Structured fields">
            <div className="detail-section-label">Structured fields <span>Select evidence and drag it onto a field, or use the pencil</span></div>
            <div className="structured-fields">
              {sortedFieldEntries.map(([name, value]) => {
                const change = lastChangeByField.get(name);
                const canCorrect = value === null || ["string", "number", "boolean"].includes(typeof value);
                return (
                  <div className={`field-row${change ? " is-changed" : ""}${editingField === name ? " is-editing" : ""}`} key={name} title={change ? `Changed from ${change.old_value || "empty"} · ${formatDate(change.checked_at)}` : undefined} onDragOver={(event) => { if (value === null || ["string", "number"].includes(typeof value)) event.preventDefault(); }} onDrop={(event) => dropEvidence(event, name, value)}>
                    <span>{name.replace(/_/g, " ")}</span>
                    {editingField === name ? (
                      <form className="field-correction-form" onSubmit={(event) => submitCorrection(event, name, value)}>
                        {typeof value === "boolean" ? <select value={correctionValue} onChange={(event) => setCorrectionValue(event.target.value)}><option value="true">true</option><option value="false">false</option></select> : <input type={typeof value === "number" ? "number" : "text"} value={correctionValue} onChange={(event) => setCorrectionValue(event.target.value)} autoFocus />}
                        <button type="submit" aria-label={`Save ${name} correction`} disabled={isCorrecting}>{isCorrecting ? <LoaderCircle className="spin" size={13} /> : <Check size={13} />}</button>
                        <button type="button" aria-label="Cancel correction" onClick={() => setEditingField(null)} disabled={isCorrecting}><X size={13} /></button>
                        {correctionError && <small>{correctionError}</small>}
                      </form>
                    ) : (
                      <div className="field-value-actions"><b><FieldValue value={value} />{change && <i className="field-changed-dot" aria-hidden="true" />}</b>{canCorrect && <button type="button" className="field-correct-button" onClick={() => startCorrection(name, value)} aria-label={`Correct ${name}`}><Pencil size={12} /></button>}</div>
                    )}
                  </div>
                );
              })}
            </div>
            {record.mission_id && <div className="candidate-actions"><span>Decision status</span>{["shortlisted", "contacted", "rejected"].map((status) => <button key={status} className={record.decision_status === status ? "active" : ""} onClick={() => onStatus(status)}>{status}</button>)}</div>}
            <div className="detail-watch-summary">
              <div><Radio size={14} /><span>{watch ? <><b>{watch.active ? `Monitoring ${watch.frequency || "daily"}` : "Monitoring paused"}</b><small>{watch.natural_language_condition}</small></> : <><b>Watch this Item</b><small>Choose a field and schedule without opening Ask.</small></>}</span></div>
              {watch ? <><button className="text-button" onClick={() => onToggleWatch(watch)} disabled={isTogglingWatch}>{isTogglingWatch ? <LoaderCircle className="spin" size={13} /> : watch.active ? <Pause size={13} /> : <Play size={13} />}{watch.active ? "Pause" : "Resume"}</button><button className="secondary-button" onClick={() => onCreateWatch(record)}>Edit watch</button></> : <button className="secondary-button" onClick={() => onCreateWatch(record)}><Plus size={13} /> Create watch</button>}
            </div>
            <div className="history-section"><h3>Change history</h3>
              {enrichments.length ? enrichments.map((item) => <div className="history-row" key={item.id}><span>{item.field}</span><del>{item.old_value || "empty"}</del><ChevronRight size={13} /><b>{item.new_value}</b><small>{formatDate(item.checked_at)}</small></div>) : <p>No field changes recorded yet.</p>}
            </div>
          </section>
        </div>
        {isBlocked && (
          <div className="blocked-notice">
            <LockKeyhole size={15} />
            <div>
              <b>This source requires sign-in.</b>
              <p>Magpie checks from a server and can't log in for you. Open the page in your browser and recapture it with the extension to update this Item.</p>
              {isAutoPaused && <p className="blocked-paused">Monitoring paused itself after repeated blocked checks.</p>}
            </div>
          </div>
        )}
        <details className="detail-more">
          <summary><SlidersHorizontal size={14} /> Source checks, captured text, remove</summary>
          <div className="detail-more-panel">
            <div className="detail-actions">
              <button className="secondary-button" onClick={() => onRefresh(refreshStrategy)} disabled={isRefreshing}>
                <RefreshCw className={isRefreshing ? "spin" : ""} size={15} /> {isRefreshing ? checkingLabel : "Check source now"}
              </button>
              <details className="refresh-options">
                <summary aria-label="Refresh options"><SlidersHorizontal size={14} /></summary>
                <div className="refresh-options-panel">
                  <label className="refresh-strategy-label">Check with
                    <select value={refreshStrategy} onChange={(event) => setRefreshStrategy(event.target.value)} disabled={isRefreshing}>
                      <option value="direct_http">Direct HTTP</option>
                      <option value="zyte">Zyte cloud (manual)</option>
                      <option value="owner_browser">My browser</option>
                    </select>
                  </label>
                  <span className="refresh-last-checked">Last checked {formatDate(record.last_check_at || record.last_enriched_at)}</span>
                </div>
              </details>
            </div>
            {refreshNotice && <div className={`refresh-notice ${refreshNotice.outcome}`}>{refreshNotice.message}</div>}
            <div className="danger-zone">
              {isConfirmingDelete ? (
                <div className="danger-confirm">
                  <span>This permanently deletes the Item, its capture, watches, and update history.</span>
                  <div>
                    <button className="danger-button" onClick={onDelete} disabled={isDeleting}>
                      {isDeleting ? <LoaderCircle className="spin" size={13} /> : <Trash2 size={13} />} Delete permanently
                    </button>
                    <button className="text-button" onClick={() => setIsConfirmingDelete(false)} disabled={isDeleting}>Keep it</button>
                  </div>
                </div>
              ) : (
                <button className="text-button danger-link" onClick={() => setIsConfirmingDelete(true)}>
                  <Trash2 size={13} /> Remove this item
                </button>
              )}
            </div>
          </div>
        </details>
      </aside>
    </div>
  );
}
