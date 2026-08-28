import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronRight, Layers3, ListFilter, LoaderCircle, MessageCircle, Plus, Radio, Search, Target } from "lucide-react";
import { truncate } from "../../lib/text.js";
import { searchWorkspace } from "../../workspace-search.js";
import SourceFavicon from "../../components/SourceFavicon.jsx";
import HighlightedText from "../../components/HighlightedText.jsx";

export default function SearchSurface({ records, clips, collections, missions, onSelectRecord, onSelectCollection, onAddCapture, onCreateProject, onCreateWatch, onAsk, onSaveSearch, onExit, focusVersion }) {
  const [query, setQuery] = useState("");
  const [scope, setScope] = useState("all");
  const [workspaceScope, setWorkspaceScope] = useState("workspace");
  const [saveName, setSaveName] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const inputRef = useRef(null);
  const scopedRecords = workspaceScope === "workspace" ? records : records.filter((record) => record.mission_id === workspaceScope);
  const scopedCollections = workspaceScope === "workspace" ? collections : collections.filter((collection) => collection.mission_id === workspaceScope);
  const results = useMemo(() => searchWorkspace({ query, records: scopedRecords, clips, collections: scopedCollections }), [query, scopedRecords, clips, scopedCollections]);
  const visibleItems = scope === "all" ? results.items : results.items.filter((result) => result.matchKind === scope);
  const scopeCounts = results.items.reduce((counts, result) => ({ ...counts, [result.matchKind]: (counts[result.matchKind] || 0) + 1 }), {});
  const watchCandidate = visibleItems[0] || results.items[0];
  useEffect(() => { inputRef.current?.focus(); }, [focusVersion]);
  const saveSearch = async (event) => {
    event.preventDefault();
    const name = saveName.trim() || `Search · ${query.trim().slice(0, 52)}`;
    setIsSaving(true);
    setSaveError("");
    try {
      await onSaveSearch(query.trim(), name, workspaceScope === "workspace" ? "" : workspaceScope);
      setSaveName("");
    } catch (error) {
      setSaveError(error.response?.data?.error || error.message || "Could not save this search.");
    } finally {
      setIsSaving(false);
    }
  };
  return (
    <section className="workspace-surface search-surface">
      <header className="surface-header"><div><div className="eyebrow">find anything you've saved</div><h1>Search</h1><p>Items, Collections, actions, and Ask Magpie in one command surface.</p></div></header>
      <div className="search-command-row">
        <label className="command-search"><Search size={20} /><input ref={inputRef} value={query} onChange={(event) => { setQuery(event.target.value); setScope("all"); }} onKeyDown={(event) => { if (event.key === "Escape") onExit(); }} placeholder="Search fields, captured text, sources — try “under 70k”" /><kbd>Esc</kbd></label>
        <label className="search-workspace-scope"><span>Search in</span><select value={workspaceScope} onChange={(event) => { setWorkspaceScope(event.target.value); setScope("all"); }}><option value="workspace">Entire workspace</option>{missions.map((mission) => <option value={mission.id} key={mission.id}>{mission.title}</option>)}</select></label>
      </div>
      {!query ? <div className="command-groups"><section><h2>Actions</h2><button type="button" onClick={onAddCapture}><Plus size={15} /><span><b>Add from phone</b><small>Paste a page and capture note</small></span></button><button type="button" onClick={onCreateProject}><Target size={15} /><span><b>New Project</b><small>Give related research a purpose</small></span></button><button type="button" onClick={onAsk}><MessageCircle size={15} /><span><b>Ask Magpie</b><small>Compare stored evidence</small></span></button></section><section><h2>Search understands</h2><div className="search-hints"><span>field values</span><span>captured text</span><span>source hosts</span><span>under / over numbers</span></div></section></div> : <div className="search-results">
        <div className="search-scopes" role="group" aria-label="Search result type"><button type="button" className={scope === "all" ? "active" : ""} onClick={() => setScope("all")}>Everything <span>{results.items.length + results.collections.length}</span></button><button type="button" className={scope === "field" ? "active" : ""} onClick={() => setScope("field")}>Fields <span>{scopeCounts.field || 0}</span></button><button type="button" className={scope === "capture" ? "active" : ""} onClick={() => setScope("capture")}>Captured text <span>{scopeCounts.capture || 0}</span></button><button type="button" className={scope === "source" ? "active" : ""} onClick={() => setScope("source")}>Sources <span>{scopeCounts.source || 0}</span></button></div>
        {results.constraint && <div className="parsed-query"><ListFilter size={14} /> Numeric constraint: {results.constraint.operator === "lte" ? "at most" : "at least"} {results.constraint.amount.toLocaleString()}</div>}
        {(results.items.length > 0 || results.collections.length > 0) && <form className="save-search-form" onSubmit={saveSearch}><label><Layers3 size={14} /><input value={saveName} onChange={(event) => setSaveName(event.target.value)} placeholder={`Save “${truncate(query, 38)}” as a live Collection`} maxLength={80} /></label><button type="submit" className="secondary-button" disabled={isSaving}>{isSaving ? <LoaderCircle className="spin" size={14} /> : <Plus size={14} />} Save live Collection</button><small className="save-search-scope">Saved in {workspaceScope === "workspace" ? "Entire workspace" : missions.find((mission) => mission.id === workspaceScope)?.title || "this Project"}.</small>{saveError && <small>{saveError}</small>}</form>}
        <section className="search-query-actions"><h2>Actions</h2>{watchCandidate && <button type="button" onClick={() => onCreateWatch(watchCandidate.record, watchCandidate.matchKind === "field" ? watchCandidate.matchedField : "")}><Radio size={15} /><span><b>Watch {watchCandidate.matchKind === "field" ? watchCandidate.matchedField.replace(/_/g, " ") : "this Item"}</b><small>{watchCandidate.title}</small></span></button>}<button type="button" onClick={() => onAsk(query)}><MessageCircle size={15} /><span><b>Ask Magpie about “{truncate(query, 44)}”</b><small>Use the matching Items and their stored evidence</small></span></button></section>
        {visibleItems.length > 0 && <section><h2>Items <span>{visibleItems.length}</span></h2>{visibleItems.map((result) => <button type="button" className="search-result" key={result.id} onClick={() => onSelectRecord(result.record)}><SourceFavicon url={result.record.source_url} large /><span><b><HighlightedText text={result.title} query={query} /></b><small>{result.collectionName} · {result.host}</small><em>matched {result.matchedField}: <HighlightedText text={truncate(result.matchedValue, 150)} query={query} /></em></span><ChevronRight size={16} /></button>)}</section>}
        {scope === "all" && results.collections.length > 0 && <section><h2>Collections <span>{results.collections.length}</span></h2>{results.collections.map((result) => <button type="button" className="search-result collection-result" key={result.id} onClick={() => onSelectCollection(result.id)}><Layers3 size={20} /><span><b><HighlightedText text={result.title} query={query} /></b><small>{result.description}</small></span><ChevronRight size={16} /></button>)}</section>}
        {!visibleItems.length && !(scope === "all" && results.collections.length) && <div className="search-empty"><Search size={22} /><h2>No matching evidence in this filter</h2><p>Choose Everything or try a field name, source, phrase from the capture, or a constraint such as “under 70k”.</p></div>}
      </div>}
    </section>
  );
}
