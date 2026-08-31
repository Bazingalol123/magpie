import { AlertTriangle, Check, LockKeyhole } from "lucide-react";
import { parseJson } from "../../lib/parsing.js";
import { relativeDate } from "../../lib/dates.js";
import { recordTitle, hostFromUrl, screenshotUrlFor } from "../../lib/text.js";
import SourceFavicon from "../../components/SourceFavicon.jsx";
import FieldValue from "../../components/FieldValue.jsx";

export default function RecordCardGrid({ records, columns, clipsById, enrichments = [], watchRules = [], onSelect, changedFirst = false, selectedRecordIds = [], onToggleSelected }) {
  if (!records.length) return <div className="table-empty">Waiting for a matching clip…</div>;

  const primaryColumn = columns[0];
  const secondaryColumns = columns.slice(1);
  const latestChangeByRecord = new Map();
  for (const enrichment of enrichments) {
    const current = latestChangeByRecord.get(enrichment.record_id);
    if (!current || new Date(enrichment.checked_at) > new Date(current.checked_at)) latestChangeByRecord.set(enrichment.record_id, enrichment);
  }
  const watchByRecord = new Map(watchRules.map((watch) => [watch.record_id, watch]));
  const orderedRecords = changedFirst
    ? [...records].sort((a, b) => Number(latestChangeByRecord.has(b.id)) - Number(latestChangeByRecord.has(a.id)))
    : records;

  return (
    <div className="card-grid" data-tour="record-grid">
      {orderedRecords.map((record) => {
        const fields = parseJson(record.fields_json, {});
        const image = screenshotUrlFor(clipsById.get(record.clip_id));
        const title = (primaryColumn && fields[primaryColumn.name]) || recordTitle(record);
        const change = latestChangeByRecord.get(record.id);
        const watch = watchByRecord.get(record.id);
        const isAutoPaused = !watch?.active && watch?.last_error_code === "AUTO_PAUSED_BLOCKED";
        const status = change ? "changed" : record.freshness === "blocked" ? "blocked" : record.freshness === "unreachable" ? "error" : "fresh";
        return (
          <div key={record.id} className={`record-card ${image ? "has-media" : "no-media"} is-${status}`} onClick={() => onSelect(record)} role="button" tabIndex={0} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onSelect(record); } }}>
            {onToggleSelected && <label className="record-card-select" onClick={(event) => event.stopPropagation()}><input type="checkbox" checked={selectedRecordIds.includes(record.id)} onChange={() => onToggleSelected(record.id)} aria-label={`Compare ${title}`} /><span><Check size={12} /></span></label>}
            <div className="record-card-media">
              {image ? (
                <img src={image} alt="" loading="lazy" />
              ) : (
                <div className="record-card-fallback"><SourceFavicon url={record.source_url} large /></div>
              )}
              {record.freshness === "blocked" && (
                <span className="record-card-badge" title="Source requires sign-in"><LockKeyhole size={11} /></span>
              )}
            </div>
            <div className="record-card-body">
              <div className="record-card-title" dir="auto">{String(title)}</div>
              {secondaryColumns.map((column) => {
                const value = fields[column.name];
                if (value === undefined || value === null || value === "") return null;
                return (
                  <div key={column.name} className="record-card-field">
                    <span>{column.label}</span><FieldValue value={value} />
                  </div>
                );
              })}
              <div className={`record-card-status is-${status}`}>
                {change ? <><span /> {change.field.replace(/_/g, " ")} changed · {relativeDate(change.checked_at)}</>
                  : record.freshness === "blocked" ? <><LockKeyhole size={11} /> {isAutoPaused ? "paused after 3 blocked checks" : "blocked"}</>
                  : record.freshness === "unreachable" ? <><AlertTriangle size={11} /> source unreachable · fields unchanged</>
                  : <>{record.last_check_at ? `checked ${relativeDate(record.last_check_at)}` : "recently captured"}</>}
              </div>
              <div className="record-card-source"><SourceFavicon url={record.source_url} />{hostFromUrl(record.source_url)}</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
