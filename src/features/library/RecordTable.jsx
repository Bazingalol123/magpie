import { useEffect, useState } from "react";
import { ChevronDown, ChevronRight, LayoutGrid, LockKeyhole, SlidersHorizontal, Table2, X } from "lucide-react";
import { parseJson } from "../../lib/parsing.js";
import { recordTitle, hostFromUrl, truncate } from "../../lib/text.js";
import { collectionDotStatus, RECORDS_PAGE_SIZE } from "../../lib/dashboardData.js";
import SourceFavicon from "../../components/SourceFavicon.jsx";
import FieldValue from "../../components/FieldValue.jsx";
import EmptyCollection from "./EmptyCollection.jsx";
import CollectionDeleteControl from "./CollectionDeleteControl.jsx";
import RecordCardGrid from "./RecordCardGrid.jsx";
import ComparisonPanel from "./ComparisonPanel.jsx";

export default function RecordTable({ collection, collections, records, totalCount = records.length, clips, enrichments, watchRules, displayMode = "cards", page, hasMore, onPageChange, onSelect, onSelectCollection, onDeleteCollection, isDeletingCollection, collectionDeleteSummary, onOpenOnboardingTour, refreshingRecordId, onDisplayModeChange, onAsk }) {
  const [mobileFilterByCollection, setMobileFilterByCollection] = useState({});
  const [mobileSort, setMobileSort] = useState("recent");
  const [selectedRecordIds, setSelectedRecordIds] = useState([]);
  const [isComparing, setIsComparing] = useState(false);
  useEffect(() => {
    setMobileSort("recent");
    setSelectedRecordIds([]);
    setIsComparing(false);
  }, [collection?.id]);
  const schema = parseJson(collection?.schema_json, []);
  const columns = Array.isArray(schema) ? schema : [];

  if (!collection) return <EmptyCollection onSelect={onOpenOnboardingTour} />;

  const clipsById = new Map(clips.map((clip) => [clip.id, clip]));
  const showCards = displayMode === "cards";
  const dotStatus = collectionDotStatus(collection, records, refreshingRecordId);
  const pageStart = page * RECORDS_PAGE_SIZE;
  const pageRecords = records;
  const changedRecordIds = new Set(enrichments.map((enrichment) => enrichment.record_id));
  const changedCount = pageRecords.filter((record) => changedRecordIds.has(record.id)).length;
  const mobileFilter = mobileFilterByCollection[collection.id] ?? (changedCount > 0 ? "changed" : "all");
  const setMobileFilter = (filter) => setMobileFilterByCollection((current) => ({ ...current, [collection.id]: filter }));
  const mobileBaseRecords = mobileFilter === "changed" ? pageRecords.filter((record) => changedRecordIds.has(record.id)) : pageRecords;
  const mobileRecords = [...mobileBaseRecords].sort((a, b) => {
    if (mobileSort === "title") return recordTitle(a).localeCompare(recordTitle(b));
    if (mobileSort === "changed") return Number(changedRecordIds.has(b.id)) - Number(changedRecordIds.has(a.id));
    return new Date(b.updated_date || b.created_date || 0) - new Date(a.updated_date || a.created_date || 0);
  });
  const selectedRecords = pageRecords.filter((record) => selectedRecordIds.includes(record.id));
  const toggleSelectedRecord = (recordId) => setSelectedRecordIds((current) => current.includes(recordId) ? current.filter((id) => id !== recordId) : [...current, recordId].slice(-4));

  return (
    <section className="table-panel">
      <div className="panel-header">
        <div>
          <div className="eyebrow">{dotStatus === "live" ? <><span className="live-dot" /> checking sources</> : "organized automatically"}</div>
          <h2 className="desktop-collection-title">{dotStatus && <span className={`collection-dot is-${dotStatus}`} />}{collection.name}</h2>
          <label className="mobile-collection-select"><span className="sr-only">Choose Collection</span><select value={collection.id} onChange={(event) => onSelectCollection(event.target.value)}>{collections.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select><ChevronDown size={18} /></label>
        </div>
        <div className="panel-header-actions">
          <div className="view-toggle" role="group" aria-label="Collection layout">
            <button type="button" className={showCards ? "active" : ""} onClick={() => onDisplayModeChange("cards")} aria-pressed={showCards}><LayoutGrid size={14} /> <span>Cards</span></button>
            <button type="button" className={!showCards ? "active" : ""} onClick={() => onDisplayModeChange("table")} aria-pressed={!showCards}><Table2 size={14} /> <span>Table</span></button>
          </div>
          <span className="panel-count">{totalCount} Item{totalCount === 1 ? "" : "s"}</span>
          <CollectionDeleteControl collection={collection} itemCount={collectionDeleteSummary.itemCount} watchCount={collectionDeleteSummary.watchCount} onDelete={onDeleteCollection} isDeleting={isDeletingCollection} />
        </div>
      </div>
      <div className="mobile-collection-delete-row"><CollectionDeleteControl mobile collection={collection} itemCount={collectionDeleteSummary.itemCount} watchCount={collectionDeleteSummary.watchCount} onDelete={onDeleteCollection} isDeleting={isDeletingCollection} /></div>
      <div className="desktop-record-view">
        {showCards ? (
          <RecordCardGrid records={pageRecords} columns={columns} clipsById={clipsById} enrichments={enrichments} watchRules={watchRules} onSelect={onSelect} selectedRecordIds={selectedRecordIds} onToggleSelected={toggleSelectedRecord} />
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th aria-label="Select for comparison" />
                  <th>Source</th>
                  {columns.map((column) => <th key={column.name}>{column.label}</th>)}
                  <th aria-label="Open record" />
                </tr>
              </thead>
              <tbody>
                {pageRecords.length ? pageRecords.map((record) => {
                  const fields = parseJson(record.fields_json, {});
                  return (
                    <tr key={record.id} onClick={() => onSelect(record)}>
                      <td><input type="checkbox" aria-label={`Compare ${recordTitle(record)}`} checked={selectedRecordIds.includes(record.id)} onChange={() => toggleSelectedRecord(record.id)} onClick={(event) => event.stopPropagation()} /></td>
                      <td>
                        <div className="source-cell"><SourceFavicon url={record.source_url} />{hostFromUrl(record.source_url)}{record.freshness === "blocked" && <span className="blocked-badge" title="Source requires sign-in"><LockKeyhole size={10} /></span>}</div>
                      </td>
                      {columns.map((column) => <td key={column.name}><FieldValue value={fields[column.name] ?? "—"} /></td>)}
                      <td><ChevronRight size={17} /></td>
                    </tr>
                  );
                }) : (
                  <tr><td colSpan={columns.length + 3}><div className="table-empty">Waiting for a matching clip…</div></td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <div className="mobile-record-view">
        <div className="mobile-collection-controls"><div className="mobile-record-filter" role="group" aria-label="Filter Collection Items"><button type="button" className={mobileFilter === "changed" ? "active" : ""} onClick={() => setMobileFilter("changed")}>Changed <span>{changedCount}</span></button><button type="button" className={mobileFilter === "all" ? "active" : ""} onClick={() => setMobileFilter("all")}>All <span>{pageRecords.length}</span></button></div><label className="mobile-sort"><SlidersHorizontal size={13} /><span className="sr-only">Sort Items</span><select value={mobileSort} onChange={(event) => setMobileSort(event.target.value)}><option value="recent">Recent</option><option value="changed">Changed first</option><option value="title">Title</option></select></label></div>
        {mobileRecords.length ? <RecordCardGrid records={mobileRecords} columns={columns} clipsById={clipsById} enrichments={enrichments} watchRules={watchRules} onSelect={onSelect} changedFirst={mobileSort === "changed"} /> : <div className="table-empty mobile-filter-empty"><span>{mobileFilter === "changed" ? "No changed Items." : "No Items in this Collection yet."}</span>{mobileFilter === "changed" && <button type="button" className="text-button" onClick={() => setMobileFilter("all")}>Browse all {pageRecords.length}</button>}</div>}
      </div>
      {(page > 0 || hasMore) && (
        <div className="table-pagination">
          <button className="secondary-button" disabled={page === 0} onClick={() => onPageChange(page - 1)}>Previous</button>
          <span>{records.length ? `${pageStart + 1}–${pageStart + records.length}` : "No Items"}</span>
          <button className="secondary-button" disabled={!hasMore} onClick={() => onPageChange(page + 1)}>Next</button>
        </div>
      )}
      {selectedRecords.length > 0 && <div className="compare-tray"><span className="eyebrow">compare tray</span><div>{selectedRecords.map((record) => <button type="button" key={record.id} onClick={() => toggleSelectedRecord(record.id)}>{truncate(recordTitle(record), 24)} <X size={12} /></button>)}</div><span>{selectedRecords.length < 2 ? "Choose one more Item" : `${selectedRecords.length} Items selected`}</span><button type="button" className="primary-button" disabled={selectedRecords.length < 2} onClick={() => setIsComparing(true)}>Compare {selectedRecords.length}</button></div>}
      {isComparing && <ComparisonPanel collection={collection} records={selectedRecords} watchRules={watchRules} onClose={() => setIsComparing(false)} onOpenRecord={onSelect} onAsk={onAsk} />}
    </section>
  );
}
