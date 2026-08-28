import { useState } from "react";
import { AlertTriangle, ArrowDown, ChevronRight, LoaderCircle, LockKeyhole, Pause, Play, Plus, Radio, RotateCcw } from "lucide-react";
import { relativeDate } from "../../lib/dates.js";
import { recordTitle } from "../../lib/text.js";
import { signalTypeFor } from "../../lib/reviewCopy.js";

export default function SignalsSurface({ records, enrichments, watchRules, refreshAttempts, onSelectRecord, onToggleWatch, togglingWatchId, onCreateWatch }) {
  const [filter, setFilter] = useState("all");
  const recordById = new Map(records.map((record) => [record.id, record]));
  const watchByRecord = new Map(watchRules.map((watch) => [watch.record_id, watch]));
  const entries = [
    ...enrichments.map((enrichment) => ({ id: `e-${enrichment.id}`, at: enrichment.checked_at, type: signalTypeFor(recordById.get(enrichment.record_id), enrichment), enrichment, record: recordById.get(enrichment.record_id), watch: watchByRecord.get(enrichment.record_id) })),
    ...records.filter((record) => record.freshness === "blocked" || record.freshness === "unreachable").map((record) => ({ id: `r-${record.id}-${record.freshness}`, at: record.last_check_at || record.updated_date, type: signalTypeFor(record), record, watch: watchByRecord.get(record.id) })),
  ].filter((entry) => entry.record).sort((a, b) => new Date(b.at) - new Date(a.at));
  const visible = filter === "all" ? entries : entries.filter((entry) => entry.type === filter);
  const today = new Date().toDateString();
  const groups = visible.reduce((acc, entry) => {
    const label = new Date(entry.at).toDateString() === today ? "Today" : "Earlier";
    (acc[label] ||= []).push(entry);
    return acc;
  }, {});
  const runningChecks = refreshAttempts.filter((attempt) => ["claimed", "running", "evidence_ready", "compared"].includes(attempt.status)).length;
  return (
    <section className="workspace-surface signals-surface">
      <header className="surface-header"><div><div className="eyebrow">what changed and why</div><h1>Signals</h1><p>Trusted source changes and watch health, grouped by when they happened.</p></div>{runningChecks > 0 && <span className="checking-label"><span className="live-dot" /> checking {runningChecks} source{runningChecks === 1 ? "" : "s"}</span>}</header>
      <div className="signal-filters" role="group" aria-label="Filter signals">{[["all", "All"], ["changed", "Changed"], ["blocked", "Blocked"], ["error", "Errors"], ["revisit", "Revisited"]].map(([id, label]) => <button type="button" key={id} className={filter === id ? "active" : ""} onClick={() => setFilter(id)}>{label}</button>)}</div>
      {visible.length ? <div className="signal-groups">{Object.entries(groups).map(([label, items]) => <section key={label}><h2>{label}</h2>{items.map((entry) => {
        const { record, enrichment, watch, type } = entry;
        return <button type="button" className={`signal-entry is-${type}`} key={entry.id} onClick={() => onSelectRecord(record)}><span className="signal-icon">{type === "changed" ? <ArrowDown size={15} /> : type === "revisit" ? <RotateCcw size={15} /> : type === "blocked" ? <LockKeyhole size={15} /> : <AlertTriangle size={15} />}</span><span className="signal-copy"><b>{recordTitle(record)}</b><span>{enrichment ? <>{enrichment.field.replace(/_/g, " ")}: <del>{enrichment.old_value || "empty"}</del> <ChevronRight size={12} /> <strong>{enrichment.new_value}</strong></> : type === "blocked" ? <>Source sign-in required. Last good read {relativeDate(record.last_enriched_at)}; {watch?.last_error_code === "AUTO_PAUSED_BLOCKED" ? "watch auto-paused after three blocked checks." : "stored fields were not changed."}</> : <>Source unreachable; fields unchanged.</>}</span><small>rule: {watch?.natural_language_condition || "any trusted field change"} · {relativeDate(entry.at)}</small></span></button>;
      })}</section>)}</div> : <div className="signals-empty"><Radio size={22} /><h2>No signals in this filter</h2><p>Choose an Item and create a watch to be told when a source-backed field changes.</p><button type="button" className="primary-button" onClick={onCreateWatch}>Create a watch</button></div>}
      <section className="watch-manager"><div className="watch-manager-head"><div><div className="eyebrow">watch manager</div><h2>Your watches</h2></div><button type="button" className="secondary-button" onClick={onCreateWatch}><Plus size={14} /> New watch</button></div>{watchRules.length ? <div className="watch-list">{watchRules.map((watch) => {
        const record = recordById.get(watch.record_id);
        const blocked = watch.last_error_code === "AUTO_PAUSED_BLOCKED";
        return <div className="watch-item" key={watch.id}><span className={`watch-state ${watch.active ? "is-active" : blocked ? "is-blocked" : "is-paused"}`}>{watch.active ? <Radio size={13} /> : blocked ? <LockKeyhole size={13} /> : <Pause size={13} />}{watch.active ? "active" : blocked ? "blocked" : "paused"}</span><p><b>{watch.natural_language_condition}</b> on <button type="button" onClick={() => record && onSelectRecord(record)}>{record ? recordTitle(record) : "Item"}</button>, checked {watch.frequency}.</p><button type="button" className="watch-toggle" disabled={togglingWatchId === watch.id} onClick={() => onToggleWatch(watch)}>{togglingWatchId === watch.id ? <LoaderCircle className="spin" size={14} /> : watch.active ? <Pause size={14} /> : <Play size={14} />}{watch.active ? "Pause" : "Resume"}</button></div>;
      })}</div> : <p className="watch-empty">No watches yet. Create one from an Item or ask Magpie.</p>}</section>
    </section>
  );
}
