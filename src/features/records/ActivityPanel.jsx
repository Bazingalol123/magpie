import { useMemo } from "react";
import { Activity, Check, Clock3, X } from "lucide-react";
import { formatDate } from "../../lib/dates.js";

export default function ActivityPanel({ enrichments, records, onSelect, onClose }) {
  const recordById = useMemo(() => new Map(records.map((record) => [record.id, record])), [records]);
  return (
    <div className="detail-overlay activity-overlay" role="presentation" onMouseDown={onClose}>
      <aside className="activity-panel" role="dialog" aria-modal="true" aria-label="Recent field updates" onMouseDown={(event) => event.stopPropagation()}>
        <div className="activity-heading"><Activity size={16} /><span>Field updates</span><button className="icon-button" onClick={onClose} aria-label="Close"><X size={17} /></button></div>
        {enrichments.length ? (
          <div className="activity-list">
            {enrichments.slice(0, 6).map((enrichment) => {
              const record = recordById.get(enrichment.record_id);
              return (
                <button key={enrichment.id} className="activity-item" onClick={() => record && onSelect(record)}>
                  <span className="activity-pulse"><Check size={11} /></span>
                  <span>
                    <b>{enrichment.field}</b> changed to <strong>{enrichment.new_value}</strong>
                    <small>{formatDate(enrichment.checked_at)}</small>
                  </span>
                </button>
              );
            })}
          </div>
        ) : (
          <div className="activity-empty"><Clock3 size={20} /><p>Changes detected by your watches will appear here.</p></div>
        )}
      </aside>
    </div>
  );
}
