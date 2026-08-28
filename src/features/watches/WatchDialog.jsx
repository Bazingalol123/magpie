import { useEffect, useState } from "react";
import { LoaderCircle, Radio, X } from "lucide-react";
import { parseJson } from "../../lib/parsing.js";
import { recordTitle } from "../../lib/text.js";

export default function WatchDialog({ records, watchRules, initialRecordId, initialField, onClose, onSave, isSaving, error }) {
  const firstRecordId = initialRecordId || records[0]?.id || "";
  const [recordId, setRecordId] = useState(firstRecordId);
  const selectedRecord = records.find((record) => record.id === recordId) ?? null;
  const scalarFields = Object.entries(parseJson(selectedRecord?.fields_json, {}))
    .filter(([, value]) => value === null || ["string", "number", "boolean"].includes(typeof value))
    .map(([name]) => name);
  const existingWatch = watchRules.find((watch) => watch.record_id === recordId);
  const safeInitialField = scalarFields.includes(initialField) ? initialField : scalarFields[0] || "__any__";
  const [field, setField] = useState(safeInitialField);
  const [frequency, setFrequency] = useState(existingWatch?.frequency || "daily");
  const [acquisitionStrategy, setAcquisitionStrategy] = useState(existingWatch?.acquisition_strategy === "owner_browser" ? "owner_browser" : "direct_http");

  useEffect(() => {
    const nextFields = Object.entries(parseJson(selectedRecord?.fields_json, {}))
      .filter(([, value]) => value === null || ["string", "number", "boolean"].includes(typeof value))
      .map(([name]) => name);
    const nextWatch = watchRules.find((watch) => watch.record_id === selectedRecord?.id);
    setField((current) => nextFields.includes(current) ? current : nextFields[0] || "__any__");
    setFrequency(nextWatch?.frequency || "daily");
    setAcquisitionStrategy(nextWatch?.acquisition_strategy === "owner_browser" ? "owner_browser" : "direct_http");
  }, [selectedRecord?.id, watchRules]);

  const submit = (event) => {
    event.preventDefault();
    if (!selectedRecord) return;
    const readableField = field === "__any__" ? "any trusted field" : field.replace(/_/g, " ");
    onSave({
      recordId: selectedRecord.id,
      field,
      condition: `Tell me when ${readableField} changes`,
      frequency,
      acquisitionStrategy,
    });
  };

  return (
    <div className="detail-overlay watch-dialog-overlay" role="presentation" onMouseDown={onClose}>
      <form className="watch-dialog" role="dialog" aria-modal="true" aria-label="Create a watch" onSubmit={submit} onMouseDown={(event) => event.stopPropagation()}>
        <div className="detail-head"><div><div className="eyebrow"><Radio size={13} /> manual watch</div><h2>{existingWatch ? "Edit this watch" : "Watch an Item"}</h2></div><button type="button" className="icon-button" onClick={onClose} aria-label="Close"><X size={19} /></button></div>
        <p>A watch is a schedule. Magpie checks the source and records trusted changes; blocked or unreachable reads never overwrite fields.</p>
        <div className="watch-sentence" aria-label="Watch configuration">
          <span>Tell me when</span>
          <label><span className="sr-only">Item</span><select value={recordId} onChange={(event) => setRecordId(event.target.value)} required>{records.map((record) => <option value={record.id} key={record.id}>{recordTitle(record)}</option>)}</select></label>
          <span>has a change to</span>
          <label><span className="sr-only">Field</span><select value={field} onChange={(event) => setField(event.target.value)}><option value="__any__">any trusted field</option>{scalarFields.map((name) => <option value={name} key={name}>{name.replace(/_/g, " ")}</option>)}</select></label>
          <span>checked</span>
          <label><span className="sr-only">Frequency</span><select value={frequency} onChange={(event) => setFrequency(event.target.value)}><option value="hourly">hourly</option><option value="daily">daily</option><option value="weekly">weekly</option></select></label>
        </div>
        <label className="watch-source-strategy">Check using<select value={acquisitionStrategy} onChange={(event) => setAcquisitionStrategy(event.target.value)}><option value="direct_http">Magpie's server</option><option value="owner_browser">My browser when I revisit</option></select></label>
        {error && <div className="review-error">{error}</div>}
        {!records.length && <div className="review-error">Add an Item before creating a watch.</div>}
        <div className="pairing-actions"><span>{existingWatch ? "Saving updates the existing Item watch." : "You can pause or edit it later in Signals."}</span><button type="submit" className="primary-button" disabled={isSaving || !selectedRecord}>{isSaving ? <LoaderCircle className="spin" size={14} /> : <Radio size={14} />} {existingWatch ? "Save watch" : "Create watch"}</button></div>
      </form>
    </div>
  );
}
