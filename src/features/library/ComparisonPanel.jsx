import { useState } from "react";
import { MessageCircle, Radio, X } from "lucide-react";
import { parseJson } from "../../lib/parsing.js";
import { recordTitle, hostFromUrl } from "../../lib/text.js";
import SourceFavicon from "../../components/SourceFavicon.jsx";
import FieldValue from "../../components/FieldValue.jsx";

export default function ComparisonPanel({ collection, records, watchRules, onClose, onOpenRecord, onAsk }) {
  const [onlyDifferences, setOnlyDifferences] = useState(true);
  const schema = parseJson(collection?.schema_json, []);
  const schemaNames = Array.isArray(schema) ? schema.map((field) => field.name) : [];
  const recordFields = records.map((record) => parseJson(record.fields_json, {}));
  const allFieldNames = [...new Set([...schemaNames, ...recordFields.flatMap((fields) => Object.keys(fields))])];
  const differing = new Set(allFieldNames.filter((name) => new Set(recordFields.map((fields) => JSON.stringify(fields[name] ?? null))).size > 1));
  const visibleFields = onlyDifferences ? allFieldNames.filter((name) => differing.has(name)) : allFieldNames;
  const watchByRecord = new Map(watchRules.map((watch) => [watch.record_id, watch]));
  return (
    <div className="detail-overlay comparison-overlay" role="presentation" onMouseDown={onClose}>
      <section className="comparison-panel" role="dialog" aria-modal="true" aria-label={`Compare Items in ${collection.name}`} onMouseDown={(event) => event.stopPropagation()}>
        <header className="comparison-head"><div><div className="eyebrow">compare · {records.length} Items · {differing.size} fields differ</div><h2>{collection.name}</h2></div><div><button type="button" className={onlyDifferences ? "secondary-button active" : "secondary-button"} onClick={() => setOnlyDifferences((current) => !current)}>Only differences</button><button type="button" className="primary-button" onClick={onAsk}><MessageCircle size={14} /> Ask about these</button><button type="button" className="icon-button" onClick={onClose} aria-label="Close comparison"><X size={19} /></button></div></header>
        <div className="comparison-scroll">
          <table className="comparison-table">
            <thead><tr><th>Field</th>{records.map((record) => <th key={record.id}><button type="button" onClick={() => { onClose(); onOpenRecord(record); }}><SourceFavicon url={record.source_url} /><span>{recordTitle(record)}</span><small>{hostFromUrl(record.source_url)}</small></button></th>)}</tr></thead>
            <tbody>
              {visibleFields.map((name) => <tr className={differing.has(name) ? "is-different" : ""} key={name}><th>{name.replace(/_/g, " ")}</th>{recordFields.map((fields, index) => <td key={records[index].id}><FieldValue value={fields[name] ?? "—"} /></td>)}</tr>)}
              <tr><th>watched</th>{records.map((record) => { const watch = watchByRecord.get(record.id); return <td key={record.id}>{watch ? <span className={`comparison-watch ${watch.active ? "active" : "paused"}`}><Radio size={11} /> {watch.active ? watch.frequency : "paused"}</span> : <span className="comparison-none">none</span>}</td>; })}</tr>
            </tbody>
          </table>
        </div>
        {!visibleFields.length && <div className="comparison-empty">These Items have the same stored values. Turn off “Only differences” to inspect every field.</div>}
      </section>
    </div>
  );
}
