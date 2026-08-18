import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  AlertTriangle,
  ArrowRightLeft,
  Book,
  Bug,
  Check,
  ChevronDown,
  ChevronRight,
  CircleDot,
  Clock3,
  Copy,
  Download,
  ExternalLink,
  FileText,
  FolderPlus,
  Inbox,
  Key,
  Layers3,
  Linkedin,
  LoaderCircle,
  LockKeyhole,
  LogOut,
  Menu,
  MessageCircle,
  Target,
  Plus,
  RefreshCw,
  Send,
  ShieldCheck,
  Sparkles,
  Trash2,
  Wand2,
  X,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { base44 } from "@/api/base44Client";
import Landing from "./Landing.jsx";
import Docs from "./Docs.jsx";
import OnboardingPanel from "./onboarding/OnboardingPanel.jsx";
import { OnboardingStage, deriveOnboardingStage, mostRecentClip as deriveMostRecentClip } from "./onboarding/state.js";
import { fetchPageWindow } from "./dashboard-pagination.js";
import magpieMarkSrc from "./icon/magpie-mark.png";

const markdownComponents = {
  table: (props) => <div className="md-table-scroll"><table {...props} /></div>,
  a: (props) => <a {...props} target="_blank" rel="noreferrer" />,
};

const emptyData = { missions: [], collections: [], records: [], clips: [], enrichments: [], routingDecisions: [], watchRules: [], extensionInstalls: [] };
const emptyPageMeta = { hasMore: false, total: 0 };
const emptyDataMeta = {
  missions: emptyPageMeta,
  collections: emptyPageMeta,
  records: emptyPageMeta,
  clips: emptyPageMeta,
  enrichments: emptyPageMeta,
  routingDecisions: emptyPageMeta,
  watchRules: emptyPageMeta,
  extensionInstalls: emptyPageMeta,
};

const DASHBOARD_LIST_LIMIT = 100;
const RECORDS_PAGE_SIZE = 8;

const listDashboardPage = (entityHandler, sort) => entityHandler.list(sort, DASHBOARD_LIST_LIMIT, 0);

const REASON_LABELS = {
  ai_unavailable: "Organization was temporarily unavailable",
  malformed_ai_response: "Magpie could not understand this page",
  ambiguous_candidates: "More than one possible type matched",
  mixed_content: "The capture mixed more than one type of content",
  invalid_schema: "The proposed fields were not usable",
  unsafe_collection_name: "Magpie could not create a safe Collection name",
  unsupported_schema: "Magpie could not create a safe Collection shape",
  insufficient_supported_fields: "Not enough usable details were captured",
  low_confidence: "Magpie was not confident enough to file this automatically",
  inactive_collection: "The matching Collection is archived",
  cross_owner_candidate: "The matched Collection was not eligible",
  ineligible_scope: "The matched Collection was out of scope",
};

function reasonLabel(code) {
  return REASON_LABELS[code] || "Magpie was not confident enough to organize this automatically";
}

function parseJson(value, fallback) {
  try {
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
}

// Stable per-collection color: derived from the collection's own id, not its
// position in whichever (possibly filtered/reordered) list is being rendered,
// so the same Collection always gets the same dot color everywhere.
function collectionDotIndex(collectionId) {
  let hash = 0;
  for (let i = 0; i < collectionId.length; i++) hash = (hash * 31 + collectionId.charCodeAt(i)) | 0;
  return Math.abs(hash) % 4;
}

// A spinner alone reads as stuck once a wait crosses a few seconds. Cycling
// through text that names plausible real work (rather than a fake progress
// bar, which is misleading for a genuinely indeterminate wait) keeps a
// 10+ second operation — a slow source fetch, a multi-tool Agent turn —
// reading as "working" instead of "broken."
function useStagedMessage(active, stages, intervalMs = 3500) {
  const [index, setIndex] = useState(0);
  useEffect(() => {
    if (!active) {
      setIndex(0);
      return undefined;
    }
    const id = setInterval(() => {
      setIndex((current) => Math.min(current + 1, stages.length - 1));
    }, intervalMs);
    return () => clearInterval(id);
  }, [active, stages, intervalMs]);
  return stages[Math.min(index, stages.length - 1)];
}

function formatDate(value) {
  if (!value) return "Not yet";
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function hostFromUrl(value) {
  try {
    return new URL(value).hostname.replace(/^www\./, "");
  } catch {
    return "source page";
  }
}

function isHttpUrl(value) {
  if (typeof value !== "string" || !/^https?:\/\//i.test(value.trim())) return false;
  try {
    const url = new URL(value.trim());
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function FieldValue({ value }) {
  if (!isHttpUrl(value)) return <>{String(value)}</>;
  const url = String(value).trim();
  return (
    <a className="field-link" href={url} target="_blank" rel="noreferrer" title={url} onClick={(event) => event.stopPropagation()}>
      {hostFromUrl(url)} <ExternalLink size={11} />
    </a>
  );
}

function screenshotUrlFor(clip) {
  return clip?.screenshot_id || (typeof clip?.screenshot === "string" ? clip.screenshot : clip?.screenshot?.url) || "";
}

function truncate(value, maxLength) {
  return value.length > maxLength ? `${value.slice(0, maxLength).trimEnd()}…` : value;
}

// clip.summary is AI-generated at capture time; older/failed-routing clips
// may not have one, so this falls back to a short raw-text preview with the
// full captured text always reachable behind a toggle rather than dumping
// the whole raw capture inline.
function CapturedContext({ clip }) {
  if (!clip?.raw_text) return null;
  const preview = clip.summary || truncate(clip.raw_text, 240);
  const hasMore = clip.summary || clip.raw_text.length > preview.length;
  return (
    <div className="clip-context">
      <div><FileText size={14} /> {clip.summary ? "Summary" : "Captured context"}</div>
      <p>{preview}</p>
      {hasMore && (
        <details className="clip-raw-toggle">
          <summary>View full captured text</summary>
          <p>{clip.raw_text}</p>
        </details>
      )}
    </div>
  );
}

function MagpieMark({ size = 28 }) {
  return <img src={magpieMarkSrc} alt="" className="magpie-mark" width={size} height={size} />;
}

function PairingDialog({ pairing, onClose }) {
  const [copied, setCopied] = useState("");

  const copy = async (value, label) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(label);
    } catch {
      setCopied("Select and copy manually");
    }
  };

  return (
    <div className="detail-overlay pairing-overlay" role="presentation" onMouseDown={onClose}>
      <section className="pairing-dialog" role="dialog" aria-modal="true" aria-label="Pair Magpie extension" onMouseDown={(event) => event.stopPropagation()}>
        <div className="detail-head">
          <div><div className="eyebrow"><Key size={13} /> browser pairing</div><h2>Connect this extension</h2></div>
          <button className="icon-button" onClick={onClose} aria-label="Close"><X size={19} /></button>
        </div>
        <p>Copy both values into the Magpie extension's side panel. The pairing token is shown only now and is stored as a hash on the server.</p>
        <div className="pairing-value"><span>Ingest function URL</span><code>{pairing.ingest_url}</code><button onClick={() => copy(pairing.ingest_url, "URL copied")}><Copy size={14} /> Copy</button></div>
        <div className="pairing-value token"><span>Paired extension token</span><code>{pairing.token}</code><button onClick={() => copy(pairing.token, "Token copied")}><Copy size={14} /> Copy</button></div>
        <div className="pairing-note"><ShieldCheck size={16} /> This token can only submit clips to your library. It cannot read anything from Magpie.</div>
        <div className="pairing-actions"><span>{copied}</span><button className="primary-button" onClick={onClose}>I saved the token</button></div>
      </section>
    </div>
  );
}

function ProjectDialog({ onClose, onCreate, isCreating }) {
  const [form, setForm] = useState({ title: "", goal: "", template: "custom", criteria: "" });
  const update = (event) => setForm((current) => ({ ...current, [event.target.name]: event.target.value }));
  const submit = (event) => {
    event.preventDefault();
    onCreate(form);
  };
  return (
    <div className="detail-overlay pairing-overlay" role="presentation" onMouseDown={onClose}>
      <form className="pairing-dialog mission-dialog" onSubmit={submit} onMouseDown={(event) => event.stopPropagation()}>
        <div className="detail-head"><div><div className="eyebrow"><Target size={13} /> new project</div><h2>What are you working toward?</h2></div><button className="icon-button" type="button" onClick={onClose} aria-label="Close"><X size={19} /></button></div>
        <p>A Project gives Magpie optional context for a focused search or decision. Auto-organization still chooses the right Collections.</p>
        <label>Project name<input name="title" placeholder="Choose my next work laptop" value={form.title} onChange={update} required /></label>
        <label>Starter template<select name="template" value={form.template} onChange={update}><option value="custom">Custom decision</option><option value="product">Product comparison</option><option value="apartment">Apartment search</option><option value="job">Job opportunities</option></select></label>
        <label>Outcome<textarea name="goal" placeholder="I need a lightweight laptop under $1,500 with excellent battery life." value={form.goal} onChange={update} rows="3" /></label>
        <label>Criteria and constraints<textarea name="criteria" placeholder="Budget is a hard limit. At least 16GB RAM. Prefer under 1.4kg." value={form.criteria} onChange={update} rows="3" /></label>
        <div className="pairing-actions"><span>You can keep multiple Projects active.</span><button className="primary-button" disabled={isCreating}>{isCreating ? <LoaderCircle className="spin" size={15} /> : <Plus size={15} />} Create Project</button></div>
      </form>
    </div>
  );
}

function BugReportDialog({ onClose, onSubmit, isSubmitting, error, result }) {
  const [form, setForm] = useState({ title: "", description: "" });
  const update = (event) => setForm((current) => ({ ...current, [event.target.name]: event.target.value }));
  const submit = (event) => {
    event.preventDefault();
    onSubmit(form);
  };

  if (result) {
    return (
      <div className="detail-overlay pairing-overlay" role="presentation" onMouseDown={onClose}>
        <div className="pairing-dialog mission-dialog" onMouseDown={(event) => event.stopPropagation()}>
          <div className="detail-head"><div><div className="eyebrow"><Check size={13} /> report sent</div><h2>Thanks — we've got it.</h2></div><button className="icon-button" type="button" onClick={onClose} aria-label="Close"><X size={19} /></button></div>
          <p>Your report is filed as <a href={result.issue_url} target="_blank" rel="noreferrer">issue #{result.issue_number} <ExternalLink size={12} /></a>. No GitHub account needed on your end — we filed it for you.</p>
          <div className="pairing-actions"><span /><button type="button" className="primary-button" onClick={onClose}>Done</button></div>
        </div>
      </div>
    );
  }

  return (
    <div className="detail-overlay pairing-overlay" role="presentation" onMouseDown={onClose}>
      <form className="pairing-dialog mission-dialog" onSubmit={submit} onMouseDown={(event) => event.stopPropagation()}>
        <div className="detail-head"><div><div className="eyebrow"><Bug size={13} /> found a bug</div><h2>What went wrong?</h2></div><button className="icon-button" type="button" onClick={onClose} aria-label="Close"><X size={19} /></button></div>
        <p>This goes straight to the team — you don't need a GitHub account to send it.</p>
        <label>Summary<input name="title" placeholder="Card images look stretched on Collection cards" value={form.title} onChange={update} required minLength={4} maxLength={120} /></label>
        <label>What happened<textarea name="description" placeholder="What you did, what you expected, and what happened instead." value={form.description} onChange={update} rows="4" required minLength={10} maxLength={4000} /></label>
        {error && <div className="error-banner">{error}</div>}
        <div className="pairing-actions"><span>Sent with your account email so we can follow up.</span><button className="primary-button" disabled={isSubmitting}>{isSubmitting ? <LoaderCircle className="spin" size={15} /> : <Bug size={15} />} Send report</button></div>
      </form>
    </div>
  );
}

function WorkspaceSwitcher({ missions, activeMissionId, onSelect, onNewProject, onDelete, deletingId, collections }) {
  const [isOpen, setIsOpen] = useState(false);
  const [confirmingId, setConfirmingId] = useState(null);
  const active = missions.find((mission) => mission.id === activeMissionId);

  useEffect(() => {
    if (!isOpen) setConfirmingId(null);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return undefined;
    const onPointerDown = (event) => {
      if (!event.target.closest?.(".workspace-switcher")) setIsOpen(false);
    };
    const onKeyDown = (event) => {
      if (event.key === "Escape") {
        setIsOpen(false);
        document.querySelector(".workspace-switcher > button")?.focus();
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [isOpen]);

  const onMenuKeyDown = (event) => {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    event.preventDefault();
    const items = [...event.currentTarget.querySelectorAll("button")];
    const index = items.indexOf(document.activeElement);
    const next = event.key === "ArrowDown"
      ? items[Math.min(index + 1, items.length - 1)] ?? items[0]
      : items[Math.max(index - 1, 0)] ?? items[0];
    next?.focus();
  };

  const choose = (missionId) => {
    setIsOpen(false);
    onSelect(missionId);
  };

  return (
    <div className="workspace-switcher">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={isOpen}
        onClick={() => setIsOpen((current) => !current)}
      >
        <h1>{active ? active.title : "Your collections"}</h1>
        <ChevronDown size={22} aria-hidden="true" />
      </button>
      {isOpen && (
        <div className="workspace-menu" role="menu" aria-label="Switch workspace" onKeyDown={onMenuKeyDown}>
          <button role="menuitem" className={active ? "" : "current"} onClick={() => choose("")}>
            <Layers3 size={14} /> Library — all Collections {!active && <Check size={14} />}
          </button>
          {missions.map((mission) => {
            const isConfirming = confirmingId === mission.id;
            const isDeleting = deletingId === mission.id;
            const count = collections.filter((collection) => collection.mission_id === mission.id).length;
            return (
              <div className="workspace-menu-row" key={mission.id}>
                <button role="menuitem" className={mission.id === activeMissionId ? "current" : ""} onClick={() => choose(mission.id)}>
                  <Target size={14} /> {mission.title} {mission.id === activeMissionId && <Check size={14} />}
                </button>
                {isConfirming ? (
                  <span className="workspace-menu-confirm">
                    <span>Delete {count} Collection{count === 1 ? "" : "s"}?</span>
                    <button
                      type="button"
                      className="danger-button danger-button-compact"
                      onClick={() => { onDelete(mission.id); setConfirmingId(null); }}
                      disabled={isDeleting}
                      aria-label={`Confirm delete ${mission.title}`}
                    >
                      {isDeleting ? <LoaderCircle className="spin" size={12} /> : <Trash2 size={12} />}
                    </button>
                    <button type="button" className="text-button" onClick={() => setConfirmingId(null)} disabled={isDeleting}>Cancel</button>
                  </span>
                ) : (
                  <button
                    type="button"
                    className="icon-button"
                    onClick={() => setConfirmingId(mission.id)}
                    aria-label={`Delete ${mission.title}`}
                  >
                    <Trash2 size={13} />
                  </button>
                )}
              </div>
            );
          })}
          <div className="workspace-menu-divider" role="separator" />
          <button role="menuitem" onClick={() => { setIsOpen(false); onNewProject(); }}>
            <Plus size={14} /> New Project
          </button>
        </div>
      )}
    </div>
  );
}

function EmptyCollection({ onSelect }) {
  return (
    <div className="empty-collection">
      <div className="empty-icon"><Inbox size={25} /></div>
      <h2>Your first Item is waiting.</h2>
      <p>Clip any product, listing, recipe, or article. Magpie will organize it into the right Collection automatically.</p>
      <button className="text-button" onClick={onSelect}>See how the capture flow works <ChevronRight size={16} /></button>
      <div className="capture-steps">
        <span><b>1</b> Clip an element</span>
        <span><b>2</b> Magpie organizes it</span>
        <span><b>3</b> Watch it change</span>
      </div>
    </div>
  );
}

function CollectionSidebar({ collections, activeCollectionId, records, onSelect, onDelete, deletingId }) {
  const [confirmingId, setConfirmingId] = useState(null);
  return (
    <aside className="collection-sidebar">
      <div className="sidebar-heading">
        <span>Collections</span>
        <span className="collection-total">{collections.length}</span>
      </div>
      <div className="collection-list">
        {collections.map((collection) => {
          const isActive = collection.id === activeCollectionId;
          const count = isActive ? records.filter((record) => record.collection_id === collection.id).length : null;
          const isConfirming = confirmingId === collection.id;
          const isDeleting = deletingId === collection.id;
          return (
            <div className={`collection-item ${isActive ? "active" : ""}`} key={collection.id}>
              <button className="collection-select" onClick={() => onSelect(collection.id)}>
                <span className={`collection-dot dot-${collectionDotIndex(collection.id)}`} />
                <span className="collection-name">{collection.name}</span>
                <span className="collection-count">{count === null ? "—" : count}</span>
              </button>
              {isConfirming ? (
                <span className="collection-confirm">
                  <span>{count === null ? "Delete this Collection?" : `Delete ${count} Item${count === 1 ? "" : "s"}?`}</span>
                  <button
                    type="button"
                    className="danger-button danger-button-compact"
                    onClick={() => { onDelete(collection.id); setConfirmingId(null); }}
                    disabled={isDeleting}
                    aria-label={`Confirm delete ${collection.name}`}
                  >
                    {isDeleting ? <LoaderCircle className="spin" size={12} /> : <Trash2 size={12} />}
                  </button>
                  <button type="button" className="text-button" onClick={() => setConfirmingId(null)} disabled={isDeleting}>Cancel</button>
                </span>
              ) : (
                <button
                  type="button"
                  className="icon-button collection-delete"
                  onClick={() => setConfirmingId(collection.id)}
                  aria-label={`Delete ${collection.name}`}
                >
                  <Trash2 size={13} />
                </button>
              )}
            </div>
          );
        })}
      </div>
      <div className="sidebar-footnote">
        <LockKeyhole size={14} />
        <span>Owner-scoped by design</span>
      </div>
    </aside>
  );
}

function RecordTable({ collection, records, clips, page, hasMore, isLoading, onPageChange, onSelect }) {
  const schema = parseJson(collection?.schema_json, []);
  const columns = Array.isArray(schema) ? schema : [];

  if (!collection) return <EmptyCollection onSelect={() => window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" })} />;

  const clipsById = new Map(clips.map((clip) => [clip.id, clip]));
  const withImageCount = records.filter((record) => screenshotUrlFor(clipsById.get(record.clip_id))).length;
  const showCards = records.length > 0 && withImageCount / records.length > 0.5;
  const pageStart = page * RECORDS_PAGE_SIZE;
  const pageRecords = records;

  return (
    <section className="table-panel">
      <div className="panel-header">
        <div>
          <div className="eyebrow"><CircleDot size={13} /> live collection</div>
          <h2><span className={`collection-dot dot-${collectionDotIndex(collection.id)}`} />{collection.name}</h2>
        </div>
        <div className="live-indicator"><span /> live</div>
      </div>
      <div className="desktop-record-view">
        {showCards ? (
          <RecordCardGrid records={pageRecords} columns={columns} clipsById={clipsById} onSelect={onSelect} />
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
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
                      <td>
                        <div className="source-cell"><span className="source-favicon">{hostFromUrl(record.source_url).charAt(0).toUpperCase()}</span>{hostFromUrl(record.source_url)}{record.freshness === "blocked" && <span className="blocked-badge" title="Source requires sign-in"><LockKeyhole size={10} /></span>}</div>
                      </td>
                      {columns.map((column) => <td key={column.name}><FieldValue value={fields[column.name] ?? "—"} /></td>)}
                      <td><ChevronRight size={17} /></td>
                    </tr>
                  );
                }) : (
                  <tr><td colSpan={columns.length + 2}><div className="table-empty">Waiting for a matching clip…</div></td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <div className="mobile-record-view">
        <RecordCardGrid records={pageRecords} columns={columns} clipsById={clipsById} onSelect={onSelect} />
      </div>
      {(page > 0 || hasMore) && (
        <div className="table-pagination">
          <button className="secondary-button" disabled={page === 0 || isLoading} onClick={() => onPageChange(page - 1)}>Previous</button>
          <span>{records.length ? `${pageStart + 1}–${pageStart + records.length}${hasMore ? "+" : ""}` : "No Items"}</span>
          <button className="secondary-button" disabled={!hasMore || isLoading} onClick={() => onPageChange(page + 1)}>{isLoading ? "Loading…" : "Next"}</button>
        </div>
      )}
    </section>
  );
}

function RecordCardGrid({ records, columns, clipsById, onSelect }) {
  if (!records.length) return <div className="table-empty">Waiting for a matching clip…</div>;

  const primaryColumn = columns[0];
  const secondaryColumns = columns.slice(1, 3);

  return (
    <div className="card-grid">
      {records.map((record) => {
        const fields = parseJson(record.fields_json, {});
        const image = screenshotUrlFor(clipsById.get(record.clip_id));
        const title = (primaryColumn && fields[primaryColumn.name]) || hostFromUrl(record.source_url);
        return (
          <div key={record.id} className={`record-card ${image ? "has-media" : "no-media"}`} onClick={() => onSelect(record)} role="button" tabIndex={0} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onSelect(record); } }}>
            <div className="record-card-media">
              {image ? (
                <img src={image} alt="" loading="lazy" />
              ) : (
                <span className="record-card-fallback">{hostFromUrl(record.source_url).charAt(0).toUpperCase()}</span>
              )}
              {record.freshness === "blocked" && (
                <span className="record-card-badge" title="Source requires sign-in"><LockKeyhole size={11} /></span>
              )}
            </div>
            <div className="record-card-body">
              <div className="record-card-title">{String(title)}</div>
              {secondaryColumns.map((column) => {
                const value = fields[column.name];
                if (value === undefined || value === null || value === "") return null;
                return (
                  <div key={column.name} className="record-card-field">
                    <span>{column.label}</span><FieldValue value={value} />
                  </div>
                );
              })}
              <div className="record-card-source"><span className="source-favicon">{hostFromUrl(record.source_url).charAt(0).toUpperCase()}</span>{hostFromUrl(record.source_url)}</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ActivityPanel({ enrichments, records, onSelect }) {
  const recordById = useMemo(() => new Map(records.map((record) => [record.id, record])), [records]);
  return (
    <aside className="activity-panel">
      <div className="activity-heading"><Activity size={16} /><span>Field updates</span></div>
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
  );
}

const CHECKING_STAGES = ["Checking…", "Still checking — some sources are slow…", "Almost done…"];

function RecordDetail({ record, clip, enrichments, watch, onClose, onRefresh, isRefreshing, onStatus, refreshNotice, onDelete, isDeleting, onToggleWatch, isTogglingWatch }) {
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);
  useEffect(() => {
    setIsConfirmingDelete(false);
  }, [record?.id]);
  const checkingLabel = useStagedMessage(isRefreshing, CHECKING_STAGES);

  if (!record) return null;
  const fields = parseJson(record.fields_json, {});
  const screenshotUrl = screenshotUrlFor(clip);
  const isBlocked = record.freshness === "blocked";
  const isAutoPaused = watch?.last_error_code === "AUTO_PAUSED_BLOCKED" && !watch?.active;
  return (
    <div className="detail-overlay" role="presentation" onMouseDown={onClose}>
      <aside className="detail-panel" role="dialog" aria-modal="true" aria-label="Item detail" onMouseDown={(event) => event.stopPropagation()}>
        <div className="detail-head">
          <div><div className="eyebrow">original context + live fields</div><h2>{fields.title || hostFromUrl(record.source_url)}</h2></div>
          <button className="icon-button" onClick={onClose} aria-label="Close"><X size={19} /></button>
        </div>
        <a className="source-link" href={record.source_url} target="_blank" rel="noreferrer"><ExternalLink size={14} /> {hostFromUrl(record.source_url)}</a>
        <div className="structured-fields">
          {Object.entries(fields).map(([name, value]) => (
            <div className="field-row" key={name}><span>{name.replace(/_/g, " ")}</span><b><FieldValue value={value} /></b></div>
          ))}
        </div>
        {record.mission_id && <div className="candidate-actions"><span>Decision status</span>{["shortlisted", "contacted", "rejected"].map((status) => <button key={status} className={record.decision_status === status ? "active" : ""} onClick={() => onStatus(status)}>{status}</button>)}</div>}
        {screenshotUrl && <img className="clip-screenshot" src={screenshotUrl} alt="Captured source page" />}
        <CapturedContext clip={clip} />
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
        {watch && (
          <div className="watch-row">
            <span className={`watch-chip ${watch.active ? "on" : "off"}`}>
              {watch.active ? "Monitoring daily" : isAutoPaused ? "Monitoring auto-paused" : "Monitoring paused"}
            </span>
            <button className="text-button" onClick={() => onToggleWatch(watch)} disabled={isTogglingWatch}>
              {isTogglingWatch ? <LoaderCircle className="spin" size={13} /> : null}
              {watch.active ? "Pause" : "Resume"}
            </button>
          </div>
        )}
        <div className="detail-actions">
          <button className="secondary-button" onClick={onRefresh} disabled={isRefreshing}>
            <RefreshCw className={isRefreshing ? "spin" : ""} size={15} /> {isRefreshing ? checkingLabel : "Check source now"}
          </button>
          <span>Last checked {formatDate(record.last_check_at || record.last_enriched_at)}</span>
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
        <div className="history-section"><h3>Change history</h3>
          {enrichments.length ? enrichments.map((item) => <div className="history-row" key={item.id}><span>{item.field}</span><del>{item.old_value || "empty"}</del><ChevronRight size={13} /><b>{item.new_value}</b><small>{formatDate(item.checked_at)}</small></div>) : <p>No field changes recorded yet.</p>}
        </div>
      </aside>
    </div>
  );
}

function NeedsReviewPanel({ clips, decisionsByClip, collections, missions, selectedClipId, onSelectClip, onClose, onResolve, onCreateProject, resolvingClipId, resolveError }) {
  const selectedClip = clips.find((clip) => clip.id === selectedClipId) ?? clips[0] ?? null;
  const decision = selectedClip ? decisionsByClip.get(selectedClip.id) : null;
  const suggestedSchema = parseJson(decision?.suggested_schema_json, []);
  const reasonCodes = parseJson(decision?.reason_codes_json, []);

  const [redirectId, setRedirectId] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [createName, setCreateName] = useState("");
  const [createFields, setCreateFields] = useState([{ name: "", type: "string" }, { name: "", type: "string" }]);
  const [createProjectId, setCreateProjectId] = useState("");
  const [newProjectTitle, setNewProjectTitle] = useState("");
  const [isSavingProject, setIsSavingProject] = useState(false);
  const [projectError, setProjectError] = useState("");
  const [isConfirmingDismiss, setIsConfirmingDismiss] = useState(false);

  useEffect(() => {
    setRedirectId("");
    setIsCreating(false);
    setCreateName(decision?.suggested_name || "");
    setCreateFields(
      suggestedSchema.length
        ? suggestedSchema.map((field) => ({ name: field.name, type: field.type || "string" }))
        : [{ name: "", type: "string" }, { name: "", type: "string" }],
    );
    setCreateProjectId(selectedClip?.mission_id || "");
    setNewProjectTitle("");
    setProjectError("");
    setIsConfirmingDismiss(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedClip?.id]);

  const saveNewProject = async () => {
    const title = newProjectTitle.trim();
    if (!title) return;
    setIsSavingProject(true);
    setProjectError("");
    try {
      const mission = await onCreateProject(title);
      setCreateProjectId(mission.id);
      setNewProjectTitle("");
    } catch (error) {
      setProjectError(error.response?.data?.error || error.message || "Could not create the Project.");
    } finally {
      setIsSavingProject(false);
    }
  };

  const isBusy = resolvingClipId === selectedClip?.id;
  const updateField = (index, patch) => {
    setCreateFields((current) => current.map((field, i) => (i === index ? { ...field, ...patch } : field)));
  };
  const addField = () => setCreateFields((current) => (current.length < 8 ? [...current, { name: "", type: "string" }] : current));
  const removeField = (index) => setCreateFields((current) => current.filter((_, i) => i !== index));

  if (!selectedClip) {
    return (
      <div className="detail-overlay" role="presentation" onMouseDown={onClose}>
        <aside className="detail-panel review-panel" role="dialog" aria-modal="true" aria-label="Needs review" onMouseDown={(event) => event.stopPropagation()}>
          <div className="detail-head">
            <div><div className="eyebrow"><Inbox size={13} /> needs review</div><h2>Nothing waiting</h2></div>
            <button className="icon-button" onClick={onClose} aria-label="Close"><X size={19} /></button>
          </div>
          <p className="review-empty">Every capture is organized. New ambiguous captures will appear here.</p>
        </aside>
      </div>
    );
  }

  return (
    <div className="detail-overlay" role="presentation" onMouseDown={onClose}>
      <aside className="detail-panel review-panel" role="dialog" aria-modal="true" aria-label="Needs review" onMouseDown={(event) => event.stopPropagation()}>
        <div className="detail-head">
          <div><div className="eyebrow"><Inbox size={13} /> needs review · {clips.length}</div><h2>Organize this capture</h2></div>
          <button className="icon-button" onClick={onClose} aria-label="Close"><X size={19} /></button>
        </div>

        {clips.length > 1 && (
          <div className="review-list">
            {clips.map((clip) => (
              <button key={clip.id} className={`review-list-item ${clip.id === selectedClip.id ? "active" : ""}`} onClick={() => onSelectClip(clip.id)}>
                {hostFromUrl(clip.source_url)}
              </button>
            ))}
          </div>
        )}

        <a className="source-link" href={selectedClip.source_url} target="_blank" rel="noreferrer"><ExternalLink size={14} /> {hostFromUrl(selectedClip.source_url)}</a>
        <CapturedContext clip={selectedClip} />

        <div className="review-reasons">
          {(reasonCodes.length ? reasonCodes : [selectedClip.routing_reason_code]).filter(Boolean).map((code) => (
            <div className="review-reason" key={code}><AlertTriangle size={13} /> {reasonLabel(code)}</div>
          ))}
          {typeof decision?.confidence === "number" && <div className="review-confidence">Confidence {Math.round(decision.confidence * 100)}%</div>}
        </div>

        {resolveError && <div className="review-error">{resolveError}</div>}

        <div className="review-actions">
          {decision?.suggested_name && (
            <button
              className="primary-button review-accept"
              disabled={isBusy}
              onClick={() => onResolve(selectedClip.id, { action: "accept", clip_id: selectedClip.id })}
            >
              {isBusy ? <LoaderCircle className="spin" size={15} /> : <Wand2 size={15} />} Accept: create "{decision.suggested_name}"
            </button>
          )}

          <div className="review-redirect">
            <select value={redirectId} onChange={(event) => setRedirectId(event.target.value)}>
              <option value="">Move to existing Collection…</option>
              {collections.map((collection) => <option value={collection.id} key={collection.id}>{collection.name}</option>)}
            </select>
            <button
              className="secondary-button"
              disabled={!redirectId || isBusy}
              onClick={() => onResolve(selectedClip.id, { action: "redirect", clip_id: selectedClip.id, collection_id: redirectId })}
            >
              <ArrowRightLeft size={14} /> Move
            </button>
          </div>

          <button type="button" className="text-button review-toggle-create" onClick={() => setIsCreating((current) => !current)}>
            <FolderPlus size={14} /> {isCreating ? "Cancel new Collection" : "Create a different Collection"}
          </button>

          {isCreating && (
            <div className="review-create-form">
              <label>Collection name<input value={createName} onChange={(event) => setCreateName(event.target.value)} placeholder="Cameras" /></label>
              <label>Project
                <select value={createProjectId} onChange={(event) => setCreateProjectId(event.target.value)}>
                  <option value="">No Project — global Library</option>
                  {missions.filter((mission) => mission.status === "active").map((mission) => (
                    <option value={mission.id} key={mission.id}>{mission.title}</option>
                  ))}
                  <option value="__new__">New Project…</option>
                </select>
              </label>
              {createProjectId === "__new__" && (
                <div className="review-new-project">
                  <input
                    value={newProjectTitle}
                    onChange={(event) => setNewProjectTitle(event.target.value)}
                    onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); saveNewProject(); } }}
                    placeholder="Project name, e.g. Getting a new camera"
                  />
                  <button type="button" className="secondary-button" onClick={saveNewProject} disabled={isSavingProject || !newProjectTitle.trim()}>
                    {isSavingProject ? <LoaderCircle className="spin" size={13} /> : <Plus size={13} />} Create
                  </button>
                </div>
              )}
              {projectError && <div className="review-error">{projectError}</div>}
              <div className="review-schema-rows">
                {createFields.map((field, index) => (
                  <div className="review-schema-row" key={index}>
                    <input value={field.name} onChange={(event) => updateField(index, { name: event.target.value })} placeholder="field_name" />
                    <select value={field.type} onChange={(event) => updateField(index, { type: event.target.value })}>
                      <option value="string">Text</option>
                      <option value="number">Number</option>
                      <option value="boolean">Yes/No</option>
                    </select>
                    <button type="button" className="icon-button" onClick={() => removeField(index)} aria-label="Remove field"><Trash2 size={14} /></button>
                  </div>
                ))}
              </div>
              {createFields.length < 8 && <button type="button" className="text-button" onClick={addField}><Plus size={13} /> Add field</button>}
              <button
                className="primary-button"
                disabled={isBusy || !createName.trim() || createProjectId === "__new__" || createFields.filter((field) => field.name.trim()).length < 1}
                onClick={() => onResolve(selectedClip.id, {
                  action: "create",
                  clip_id: selectedClip.id,
                  collection_name: createName.trim(),
                  schema: createFields.filter((field) => field.name.trim()).map((field) => ({ name: field.name.trim(), type: field.type })),
                  project_id: createProjectId || undefined,
                })}
              >
                {isBusy ? <LoaderCircle className="spin" size={15} /> : <FolderPlus size={15} />} Create Collection & file this Item
              </button>
            </div>
          )}

          <div className="review-dismiss">
            {isConfirmingDismiss ? (
              <div className="danger-confirm">
                <span>This permanently deletes the capture and its routing history.</span>
                <div>
                  <button className="danger-button" disabled={isBusy} onClick={() => onResolve(selectedClip.id, { action: "dismiss", clip_id: selectedClip.id })}>
                    {isBusy ? <LoaderCircle className="spin" size={13} /> : <Trash2 size={13} />} Dismiss permanently
                  </button>
                  <button className="text-button" onClick={() => setIsConfirmingDismiss(false)} disabled={isBusy}>Keep it</button>
                </div>
              </div>
            ) : (
              <button type="button" className="text-button danger-link" onClick={() => setIsConfirmingDismiss(true)}>
                <Trash2 size={13} /> Dismiss — I don't want this capture
              </button>
            )}
          </div>
        </div>
      </aside>
    </div>
  );
}

function messageText(content) {
  if (typeof content === "string") return content;
  if (content && typeof content === "object") {
    if (typeof content.text === "string") return content.text;
    if (typeof content.message === "string") return content.message;
    return JSON.stringify(content, null, 2);
  }
  return "";
}

const THINKING_STAGES = ["Reading your Magpie evidence…", "Still thinking — checking a few things…", "Almost there…"];

function MagpieAgentPanel({ project, collection, record, onClose }) {
  const [conversation, setConversation] = useState(null);
  const [input, setInput] = useState("");
  const [isLoadingConversation, setIsLoadingConversation] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState("");
  const thinkingLabel = useStagedMessage(isSending, THINKING_STAGES);

  useEffect(() => {
    let active = true;
    base44.agents.listConversations({
      q: { agent_name: "magpie_organizer" },
      sort: "-updated_date",
      limit: 1,
    })
      .then((conversations) => {
        if (active) setConversation(conversations[0] ?? null);
      })
      .catch((loadError) => {
        if (active) setError(loadError.message || "Could not load Magpie Agent conversations.");
      })
      .finally(() => {
        if (active) setIsLoadingConversation(false);
      });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!conversation?.id) return undefined;
    return base44.agents.subscribeToConversation(conversation.id, (updatedConversation) => {
      setConversation(updatedConversation);
      const latest = updatedConversation.messages?.at(-1);
      const runningTool = latest?.tool_calls?.some((tool) =>
        tool.status === "running" || tool.status === "waiting_for_user_input"
      );
      if (latest?.role === "assistant" && !runningTool) setIsSending(false);
    });
  }, [conversation?.id]);

  const createConversation = async () => {
    const created = await base44.agents.createConversation({
      agent_name: "magpie_organizer",
      metadata: {
        surface: "dashboard",
        project_id: project?.id ?? null,
        collection_id: collection?.id ?? null,
        record_id: record?.id ?? null,
      },
    });
    setConversation(created);
    return created;
  };

  const startNewConversation = async () => {
    setError("");
    setIsLoadingConversation(true);
    try {
      await createConversation();
    } catch (createError) {
      setError(createError.message || "The Magpie Agent is not available in this environment yet.");
    } finally {
      setIsLoadingConversation(false);
    }
  };

  const sendMessage = async (event, suggestedText) => {
    event?.preventDefault();
    const content = (suggestedText ?? input).trim();
    if (!content || isSending) return;
    setError("");
    setIsSending(true);
    setInput("");
    try {
      const activeConversation = conversation ?? await createConversation();
      const message = await base44.agents.addMessage(activeConversation, {
        role: "user",
        content,
        custom_context: [{
          type: "magpie_dashboard_selection",
          message: "The user is currently viewing this Magpie dashboard context.",
          data: {
            project_id: project?.id ?? null,
            project_title: project?.title ?? null,
            collection_id: collection?.id ?? null,
            collection_name: collection?.name ?? null,
            record_id: record?.id ?? null,
          },
        }],
      });
      setConversation((current) => {
        const base = current?.id === activeConversation.id ? current : activeConversation;
        const messages = base.messages ?? [];
        return messages.some((item) => item.id === message.id)
          ? base
          : { ...base, messages: [...messages, message] };
      });
    } catch (sendError) {
      setIsSending(false);
      setInput(content);
      setError(sendError.message || "Magpie could not answer right now.");
    }
  };

  const messages = (conversation?.messages ?? []).filter((message) =>
    !message.hidden && (message.role === "user" || message.role === "assistant") &&
    messageText(message.content)
  );
  const contextLabel = record
    ? "Current Item"
    : collection
    ? collection.name
    : project
    ? project.title
    : "All Collections";

  return (
    <div className="agent-overlay" role="presentation" onMouseDown={onClose}>
      <aside className="agent-panel" role="dialog" aria-modal="true" aria-label="Ask Magpie" onMouseDown={(event) => event.stopPropagation()}>
        <header className="agent-head">
          <div className="agent-title">
            <MagpieMark size={32} />
            <div><div className="eyebrow"><Sparkles size={12} /> evidence-grounded agent</div><h2>Ask Magpie</h2></div>
          </div>
          <div className="agent-head-actions">
            <button className="agent-new-button" onClick={startNewConversation} disabled={isLoadingConversation}>New chat</button>
            <button className="icon-button" onClick={onClose} aria-label="Close Magpie Agent"><X size={19} /></button>
          </div>
        </header>
        <div className="agent-context"><CircleDot size={12} /><span>Context: {contextLabel}</span></div>

        <section className="agent-messages" aria-live="polite">
          {isLoadingConversation ? (
            <div className="agent-loading"><LoaderCircle className="spin" size={19} /> Loading conversation…</div>
          ) : messages.length ? messages.map((message) => (
            <div className={`agent-message ${message.role}`} key={message.id}>
              <span>{message.role === "assistant" ? "Magpie" : "You"}</span>
              {message.role === "assistant" ? (
                <div className="agent-md">
                  <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
                    {messageText(message.content)}
                  </ReactMarkdown>
                </div>
              ) : (
                <p>{messageText(message.content)}</p>
              )}
            </div>
          )) : (
            <div className="agent-welcome">
              <MagpieMark size={46} />
              <h3>Turn your captures into a decision.</h3>
              <p>I can explain organization, compare Items across stored evidence, and configure explicit watches.</p>
              <div className="agent-suggestions">
                <button onClick={(event) => sendMessage(event, "What is in my workspace, and what needs my attention?")}>Summarize my workspace</button>
                <button onClick={(event) => sendMessage(event, "Explain how the current Items are organized.")}>Explain organization</button>
                <button onClick={(event) => sendMessage(event, "Which Items can I meaningfully compare right now?")}>Find comparisons</button>
              </div>
            </div>
          )}
          {isSending && <div className="agent-thinking"><LoaderCircle className="spin" size={14} /> {thinkingLabel}</div>}
        </section>

        {error && <div className="agent-error">{error}</div>}
        <form className="agent-composer" onSubmit={sendMessage}>
          <textarea
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) sendMessage(event);
            }}
            placeholder="Ask about your Projects, Collections, Items, or watches…"
            rows="2"
            aria-label="Message Magpie Agent"
          />
          <button type="submit" disabled={!input.trim() || isSending} aria-label="Send message"><Send size={17} /></button>
        </form>
        <footer className="agent-foot"><ShieldCheck size={12} /> Owner-scoped tools. No direct database authority.</footer>
      </aside>
    </div>
  );
}

export default function App() {
  const [user, setUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [data, setData] = useState(emptyData);
  const [dataMeta, setDataMeta] = useState(emptyDataMeta);
  const [activeCollectionId, setActiveCollectionId] = useState(null);
  const [recordPage, setRecordPage] = useState(0);
  const [isLoadingRecords, setIsLoadingRecords] = useState(false);
  const activeCollectionIdRef = useRef(null);
  const recordPageRef = useRef(0);
  const dashboardLoadRef = useRef(null);
  const [activeMissionId, setActiveMissionId] = useState("");
  const [selectedRecord, setSelectedRecord] = useState(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isPairing, setIsPairing] = useState(false);
  const [pairing, setPairing] = useState(null);
  const [isCreatingMission, setIsCreatingMission] = useState(false);
  const [isProjectDialogOpen, setIsProjectDialogOpen] = useState(false);
  const [isAgentOpen, setIsAgentOpen] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isWorkspacePreviewOpen, setIsWorkspacePreviewOpen] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [refreshNotice, setRefreshNotice] = useState(null);
  const [isReviewOpen, setIsReviewOpen] = useState(false);
  const [selectedReviewClipId, setSelectedReviewClipId] = useState(null);
  const [resolvingClipId, setResolvingClipId] = useState(null);
  const [resolveError, setResolveError] = useState("");
  const [isDeletingRecord, setIsDeletingRecord] = useState(false);
  const [isTogglingWatch, setIsTogglingWatch] = useState(false);
  const [deletingCollectionId, setDeletingCollectionId] = useState(null);
  const [deletingMissionId, setDeletingMissionId] = useState(null);
  const [isBugReportOpen, setIsBugReportOpen] = useState(false);
  const [isReportingBug, setIsReportingBug] = useState(false);
  const [bugReportError, setBugReportError] = useState("");
  const [bugReportResult, setBugReportResult] = useState(null);
  const [onboardingDismissed, setOnboardingDismissed] = useState(
    () => window.localStorage.getItem("magpie.onboarding.dismissed") === "true",
  );

  const fetchRecordsPage = useCallback(async (collectionId, page) => {
    if (!collectionId) return { items: [], hasMore: false, page, pageSize: RECORDS_PAGE_SIZE };
    return fetchPageWindow(
      (skip, limit) => base44.entities.Record.filter({ collection_id: collectionId }, "-created_date", limit, skip),
      page,
      { pageSize: RECORDS_PAGE_SIZE },
    );
  }, []);

  const loadRecordPage = useCallback(async (collectionId, page) => {
    setIsLoadingRecords(true);
    try {
      const result = await fetchRecordsPage(collectionId, page);
      recordPageRef.current = page;
      setRecordPage(page);
      setData((current) => ({ ...current, records: result.items }));
      setDataMeta((current) => ({ ...current, records: { hasMore: result.hasMore, total: null } }));
      return result;
    } finally {
      setIsLoadingRecords(false);
    }
  }, [fetchRecordsPage]);

  const loadDashboard = useCallback(async () => {
    const [missions, collections, clips, enrichments, routingDecisions, watchRules, extensionInstalls] = await Promise.all([
      listDashboardPage(base44.entities.Mission, "-created_date"),
      listDashboardPage(base44.entities.Collection, "name"),
      listDashboardPage(base44.entities.Clip, "-captured_at"),
      listDashboardPage(base44.entities.Enrichment, "-checked_at"),
      listDashboardPage(base44.entities.RoutingDecision, "-decided_at"),
      listDashboardPage(base44.entities.WatchRule, "-created_date"),
      listDashboardPage(base44.entities.ExtensionInstall, "-created_at"),
    ]);
    const selectedCollectionId = activeCollectionIdRef.current && collections.some((item) => item.id === activeCollectionIdRef.current)
      ? activeCollectionIdRef.current
      : collections[0]?.id ?? null;
    activeCollectionIdRef.current = selectedCollectionId;
    setActiveCollectionId(selectedCollectionId);
    setActiveMissionId((current) => current && missions.some((item) => item.id === current) ? current : "");
    const recordsPage = await fetchRecordsPage(selectedCollectionId, recordPageRef.current);
    const next = {
      missions,
      collections,
      records: recordsPage.items,
      clips,
      enrichments,
      routingDecisions,
      watchRules,
      extensionInstalls,
    };
    setData(next);
    setDataMeta({
      missions: { hasMore: missions.length >= DASHBOARD_LIST_LIMIT, total: null },
      collections: { hasMore: collections.length >= DASHBOARD_LIST_LIMIT, total: null },
      records: { hasMore: recordsPage.hasMore, total: null },
      clips: { hasMore: clips.length >= DASHBOARD_LIST_LIMIT, total: null },
      enrichments: { hasMore: enrichments.length >= DASHBOARD_LIST_LIMIT, total: null },
      routingDecisions: { hasMore: routingDecisions.length >= DASHBOARD_LIST_LIMIT, total: null },
      watchRules: { hasMore: watchRules.length >= DASHBOARD_LIST_LIMIT, total: null },
      extensionInstalls: { hasMore: extensionInstalls.length >= DASHBOARD_LIST_LIMIT, total: null },
    });
    return next;
  }, [fetchRecordsPage]);

  const requestDashboardLoad = useCallback(() => {
    if (dashboardLoadRef.current) return dashboardLoadRef.current;
    const pending = loadDashboard().finally(() => {
      dashboardLoadRef.current = null;
    });
    dashboardLoadRef.current = pending;
    return pending;
  }, [loadDashboard]);

  const selectCollection = useCallback((collectionId) => {
    activeCollectionIdRef.current = collectionId;
    recordPageRef.current = 0;
    setActiveCollectionId(collectionId);
    setRecordPage(0);
    loadRecordPage(collectionId, 0).catch((error) => setLoadError(error.message || "Could not load this Collection."));
  }, [loadRecordPage]);

  const changeRecordPage = useCallback((page) => {
    loadRecordPage(activeCollectionIdRef.current, page).catch((error) => setLoadError(error.message || "Could not load this page."));
  }, [loadRecordPage]);

  useEffect(() => {
    let active = true;
    base44.auth.me()
      .then((currentUser) => active && setUser(currentUser))
      .catch(() => active && setUser(null))
      .finally(() => active && setIsLoading(false));
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!user) return undefined;
    let cancelled = false;
    let debounceTimer = null;
    const load = async () => {
      try {
        await requestDashboardLoad();
        if (!cancelled) setLoadError("");
      } catch (error) {
        if (!cancelled) setLoadError(error.message || "Could not load your workspace.");
      }
    };
    // A cascade delete (delete-collection/delete-mission) can touch dozens of
    // rows across several entities in quick succession. Without debouncing,
    // each subscription fires its own full reload per row change, bursting
    // enough parallel list calls to trip Base44's rate limit (429).
    const debouncedLoad = () => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(load, 400);
    };
    load();
    const unsubscribers = [
      base44.entities.Collection.subscribe(debouncedLoad),
      base44.entities.Record.subscribe(debouncedLoad),
      base44.entities.Clip.subscribe(debouncedLoad),
      base44.entities.Enrichment.subscribe(debouncedLoad),
      base44.entities.RoutingDecision.subscribe(debouncedLoad),
      base44.entities.WatchRule.subscribe(debouncedLoad),
      base44.entities.ExtensionInstall.subscribe(debouncedLoad),
    ];
    return () => {
      cancelled = true;
      clearTimeout(debounceTimer);
      unsubscribers.forEach((unsubscribe) => unsubscribe());
    };
  }, [loadDashboard, user]);

  useEffect(() => {
    if (!user) return;
    const params = new URLSearchParams(window.location.search);
    const reviewId = params.get("review");
    if (!reviewId) return;
    setSelectedReviewClipId(reviewId);
    setIsReviewOpen(true);
    params.delete("review");
    const remaining = params.toString();
    window.history.replaceState(null, "", remaining ? `?${remaining}` : window.location.pathname);
  }, [user]);

  const handleSignIn = async () => {
    setIsSigningIn(true);
    try {
      await base44.auth.loginWithProvider("google", window.location.href);
    } catch (error) {
      setLoadError(error.message || "Could not start sign-in.");
      setIsSigningIn(false);
    }
  };

  const handleSignOut = () => base44.auth.logout(window.location.href);

  const handleCreatePairing = async () => {
    setIsPairing(true);
    try {
      const response = await base44.functions.invoke("create-extension-pairing", { label: "Chrome extension" });
      const localBackendUrl = import.meta.env.VITE_BASE44_APP_BASE_URL;
      const localAppId = import.meta.env.VITE_BASE44_APP_ID;
      setPairing({
        ...response.data,
        ingest_url: localBackendUrl && localAppId
          ? `${localBackendUrl.replace(/\/$/, "")}/api/apps/${encodeURIComponent(localAppId)}/functions/ingest-clip`
          : response.data.ingest_url,
      });
    } catch (error) {
      setLoadError(error.response?.data?.error || error.message || "Could not create a pairing token.");
    } finally {
      setIsPairing(false);
    }
  };

  const refreshSelectedRecord = async () => {
    if (!selectedRecord) return;
    setIsRefreshing(true);
    setRefreshNotice(null);
    try {
      const response = await base44.functions.invoke("enrich-record", { record_id: selectedRecord.id });
      setRefreshNotice(response.data);
      setSelectedRecord((current) => current ? {
        ...current,
        last_check_at: response.data.checked_at,
        enrichment_status: response.data.outcome,
      } : current);
      await requestDashboardLoad();
    } catch (error) {
      setLoadError(error.response?.data?.error || error.message || "Could not check this source.");
    } finally {
      setIsRefreshing(false);
    }
  };

  const createMission = async (form) => {
    setIsCreatingMission(true);
    try {
      await base44.functions.invoke("create-mission", form);
      await requestDashboardLoad();
      setIsProjectDialogOpen(false);
    } catch (error) {
      setLoadError(error.response?.data?.error || error.message || "Could not start this mission.");
    } finally {
      setIsCreatingMission(false);
    }
  };

  const reportBug = async (form) => {
    setIsReportingBug(true);
    setBugReportError("");
    try {
      const response = await base44.functions.invoke("report-bug", {
        ...form,
        page_context: activeCollection ? `Collection: ${activeCollection.name}` : "Library",
        user_agent: navigator.userAgent,
      });
      setBugReportResult(response.data);
    } catch (error) {
      setBugReportError(error.response?.data?.error || error.message || "Could not send this report.");
    } finally {
      setIsReportingBug(false);
    }
  };

  const closeBugReport = () => {
    setIsBugReportOpen(false);
    setBugReportResult(null);
    setBugReportError("");
  };

  const updateCandidateStatus = async (decisionStatus) => {
    if (!selectedRecord) return;
    try {
      const nextAction = decisionStatus === "contacted" ? "Wait for a reply, then schedule a viewing." : decisionStatus === "shortlisted" ? "Compare against your constraints before contacting." : "No further action needed.";
      await base44.entities.Record.update(selectedRecord.id, { decision_status: decisionStatus, next_action: nextAction });
      setSelectedRecord((current) => ({ ...current, decision_status: decisionStatus, next_action: nextAction }));
      await requestDashboardLoad();
    } catch (error) {
      setLoadError(error.message || "Could not update this candidate.");
    }
  };

  const selectRecord = (record) => {
    setRefreshNotice(null);
    setSelectedRecord(record);
  };

  const resolveReview = async (clipId, command) => {
    setResolvingClipId(clipId);
    setResolveError("");
    try {
      await base44.functions.invoke("resolve-routing", command);
    } catch (error) {
      if (error.response?.status !== 404) {
        setResolveError(error.response?.data?.error || error.message || "Could not resolve this capture.");
        setResolvingClipId(null);
        return;
      }
    }
    try {
      const refreshed = await requestDashboardLoad();
      const remaining = refreshed.clips.filter((clip) => clip.routing_status === "needs_review" && clip.id !== clipId);
      setSelectedReviewClipId(remaining[0]?.id ?? null);
    } finally {
      setResolvingClipId(null);
    }
  };

  const deleteSelectedRecord = async () => {
    if (!selectedRecord) return;
    setIsDeletingRecord(true);
    try {
      await base44.functions.invoke("delete-record", { record_id: selectedRecord.id });
    } catch (error) {
      if (error.response?.status !== 404) {
        setLoadError(error.response?.data?.error || error.message || "Could not remove this item.");
        setIsDeletingRecord(false);
        return;
      }
    }
    setSelectedRecord(null);
    setRefreshNotice(null);
    await requestDashboardLoad();
    setIsDeletingRecord(false);
  };

  const deleteCollection = async (collectionId) => {
    setDeletingCollectionId(collectionId);
    try {
      await base44.functions.invoke("delete-collection", { collection_id: collectionId });
    } catch (error) {
      if (error.response?.status !== 404) {
        setLoadError(error.response?.data?.error || error.message || "Could not remove this collection.");
        setDeletingCollectionId(null);
        return;
      }
    }
    if (selectedRecord?.collection_id === collectionId) {
      setSelectedRecord(null);
      setRefreshNotice(null);
    }
    await requestDashboardLoad();
    setDeletingCollectionId(null);
  };

  const deleteMission = async (missionId) => {
    setDeletingMissionId(missionId);
    try {
      await base44.functions.invoke("delete-mission", { mission_id: missionId });
    } catch (error) {
      if (error.response?.status !== 404) {
        setLoadError(error.response?.data?.error || error.message || "Could not remove this Project.");
        setDeletingMissionId(null);
        return;
      }
    }
    if (selectedRecord?.mission_id === missionId) {
      setSelectedRecord(null);
      setRefreshNotice(null);
    }
    await requestDashboardLoad();
    setDeletingMissionId(null);
  };

  const toggleSelectedWatch = async (watch) => {
    if (!selectedRecord || !watch) return;
    setIsTogglingWatch(true);
    try {
      await base44.functions.invoke("agent-configure-monitoring", {
        action: watch.active ? "pause" : "resume",
        record_id: selectedRecord.id,
        watch_rule_id: watch.id,
      });
      await requestDashboardLoad();
    } catch (error) {
      setLoadError(error.response?.data?.error || error.message || "Could not update this watch.");
    } finally {
      setIsTogglingWatch(false);
    }
  };

  const createProjectInline = async (title) => {
    const response = await base44.functions.invoke("create-mission", { title });
    await requestDashboardLoad();
    return response.data.mission;
  };

  const activeMission = data.missions.find((mission) => mission.id === activeMissionId);
  const missionRecords = activeMission ? data.records.filter((record) => record.mission_id === activeMission.id) : data.records;
  const missionCollectionIds = new Set(missionRecords.map((record) => record.collection_id));
  const missionCollections = activeMission
    ? data.collections.filter((collection) => collection.mission_id === activeMission.id || missionCollectionIds.has(collection.id))
    : data.collections;
  const activeCollection = missionCollections.find((collection) => collection.id === activeCollectionId) ?? missionCollections[0];
  const activeRecords = missionRecords.filter((record) => record.collection_id === activeCollection?.id);
  const selectedClip = data.clips.find((clip) => clip.id === selectedRecord?.clip_id);
  const selectedEnrichments = data.enrichments.filter((item) => item.record_id === selectedRecord?.id);
  const selectedWatch = data.watchRules.find((watch) => watch.record_id === selectedRecord?.id);
  const missionConstraints = parseJson(activeMission?.constraints_json, {});
  const needsReviewClips = data.clips.filter((clip) => clip.routing_status === "needs_review");
  const decisionsByClip = useMemo(
    () => new Map(data.routingDecisions.map((decision) => [decision.clip_id, decision])),
    [data.routingDecisions],
  );
  const onboardingStage = useMemo(
    () => deriveOnboardingStage({
      extensionInstalls: data.extensionInstalls,
      clips: data.clips,
      dismissed: onboardingDismissed,
    }),
    [data.extensionInstalls, data.clips, onboardingDismissed],
  );
  const isFirstRun = onboardingStage === OnboardingStage.NOT_PAIRED
    && data.collections.length === 0
    && data.records.length === 0
    && data.clips.length === 0;
  const dismissOnboarding = () => {
    window.localStorage.setItem("magpie.onboarding.dismissed", "true");
    setOnboardingDismissed(true);
  };
  const openOnboardingReview = (clipId) => {
    setSelectedReviewClipId(clipId);
    setIsReviewOpen(true);
  };

  const docsParams = new URLSearchParams(window.location.search);
  if (docsParams.has("docs")) {
    return <Docs initialSlug={docsParams.get("docs")} isSignedIn={!!user} isSigningIn={isSigningIn} onSignIn={handleSignIn} />;
  }

  if (isLoading) return <main className="app-loader"><LoaderCircle className="spin" size={24} /></main>;
  if (!user) return <Landing isSigningIn={isSigningIn} onSignIn={handleSignIn} />;

  return (
    <main className={`app-shell ${isFirstRun && !isWorkspacePreviewOpen ? "first-run" : ""}`}>
      <header className="topbar">
        <div className="brand-lockup"><MagpieMark /><span>magpie</span><i>beta</i></div>
        <div className="topbar-center"><span className="status-dot" /> Syncing live</div>
        <div className="user-menu">{needsReviewClips.length > 0 && <button className="review-launch-button" onClick={() => { setSelectedReviewClipId((current) => needsReviewClips.some((clip) => clip.id === current) ? current : needsReviewClips[0].id); setIsReviewOpen(true); }}><Inbox size={14} /> Needs review <span className="review-badge">{needsReviewClips.length}</span></button>}<button className="agent-launch-button" onClick={() => setIsAgentOpen(true)}><MessageCircle size={14} /> Ask Magpie</button><button className="mobile-menu-button icon-button" onClick={() => setIsMobileMenuOpen((current) => !current)} aria-label="Open menu" aria-expanded={isMobileMenuOpen}><Menu size={18} /></button>{isMobileMenuOpen && <div className="mobile-menu" role="menu"><a href="/?docs=getting-started" role="menuitem"><Book size={15} /> Docs</a><span role="menuitem" className="mobile-menu-account">{user.full_name || user.email}</span><button role="menuitem" onClick={handleSignOut}><LogOut size={15} /> Sign out</button></div>}<a className="pair-button docs-launch-button" href="/?docs=getting-started"><Book size={14} /> Docs</a><a className="pair-button" href="https://github.com/Bazingalol123/magpie/releases/latest" target="_blank" rel="noreferrer"><Download size={14} /> Get extension</a><button className="pair-button" onClick={handleCreatePairing} disabled={isPairing}>{isPairing ? <LoaderCircle className="spin" size={14} /> : <Key size={14} />} Pair extension</button><span>{user.full_name || user.email}</span><button className="icon-button desktop-signout" onClick={handleSignOut} aria-label="Sign out"><LogOut size={16} /></button></div>
      </header>
      <section className="workspace-heading">
        <div><div className="eyebrow"><Sparkles size={14} /> automatically organized, always current</div><WorkspaceSwitcher missions={data.missions} collections={data.collections} activeMissionId={activeMissionId} onSelect={(missionId) => { setActiveMissionId(missionId); const first = data.collections.find((collection) => collection.mission_id === missionId); selectCollection(first?.id ?? null); }} onNewProject={() => setIsProjectDialogOpen(true)} onDelete={deleteMission} deletingId={deletingMissionId} /><p className="mission-summary">{activeMission ? missionConstraints.criteria || activeMission.goal || "A focused Project with automatically organized Collections." : "Everything you clip, organized into reusable Collections."}</p></div>
        <div className="heading-actions"><div className="capture-status"><Layers3 size={16} /><span title={dataMeta.records.hasMore ? "More Items exist than are currently loaded. Narrow to a Project or Collection to see everything in that scope." : undefined}>{activeMission ? missionRecords.length : data.records.length}{dataMeta.records.hasMore ? "+" : ""} Items</span></div><button className="secondary-button mission-button" onClick={() => setIsProjectDialogOpen(true)}><Plus size={15} /> New Project</button></div>
      </section>
      {loadError && <div className="error-banner">{loadError}<button onClick={() => setLoadError("")}><X size={15} /></button></div>}
      <OnboardingPanel
        stage={onboardingStage}
        extensionInstalls={data.extensionInstalls}
        mostRecentClip={deriveMostRecentClip(data.clips)}
        collections={data.collections}
        isPairing={isPairing}
        onPair={handleCreatePairing}
        onDismiss={dismissOnboarding}
        onViewCollection={selectCollection}
        onOpenReview={openOnboardingReview}
        onReportIssue={() => setIsBugReportOpen(true)}
        onOpenWorkspace={() => setIsWorkspacePreviewOpen(true)}
      />
      <section className="workspace-grid">
        <CollectionSidebar collections={missionCollections} activeCollectionId={activeCollection?.id} records={missionRecords} onSelect={selectCollection} onDelete={deleteCollection} deletingId={deletingCollectionId} />
        <RecordTable collection={activeCollection} records={activeRecords} clips={data.clips} page={recordPage} hasMore={dataMeta.records.hasMore} isLoading={isLoadingRecords} onPageChange={changeRecordPage} onSelect={selectRecord} />
        <ActivityPanel enrichments={data.enrichments} records={data.records} onSelect={selectRecord} />
      </section>
      <footer className="workspace-footer"><span><span className="status-dot" /> Auto-organization and source checks are live</span><span>Magpie never grants the extension read access.</span><div className="footer-links"><a className="footer-link" href="https://www.linkedin.com/company/magpie-or-else" target="_blank" rel="noreferrer"><Linkedin size={12} /> Follow on LinkedIn</a><button type="button" className="footer-link footer-link-button" onClick={() => setIsBugReportOpen(true)}><Bug size={12} /> Found a bug?</button></div></footer>
      <RecordDetail record={selectedRecord} clip={selectedClip} enrichments={selectedEnrichments} watch={selectedWatch} onClose={() => { setSelectedRecord(null); setRefreshNotice(null); }} onRefresh={refreshSelectedRecord} isRefreshing={isRefreshing} onStatus={updateCandidateStatus} refreshNotice={refreshNotice} onDelete={deleteSelectedRecord} isDeleting={isDeletingRecord} onToggleWatch={toggleSelectedWatch} isTogglingWatch={isTogglingWatch} />
      {pairing && <PairingDialog pairing={pairing} onClose={() => setPairing(null)} />}
      {isProjectDialogOpen && <ProjectDialog onClose={() => setIsProjectDialogOpen(false)} onCreate={createMission} isCreating={isCreatingMission} />}
      {isBugReportOpen && (
        <BugReportDialog
          onClose={closeBugReport}
          onSubmit={reportBug}
          isSubmitting={isReportingBug}
          error={bugReportError}
          result={bugReportResult}
        />
      )}
      {isAgentOpen && <MagpieAgentPanel project={activeMission} collection={activeCollection} record={selectedRecord} onClose={() => setIsAgentOpen(false)} />}
      {isReviewOpen && (
        <NeedsReviewPanel
          clips={needsReviewClips}
          decisionsByClip={decisionsByClip}
          collections={data.collections}
          missions={data.missions}
          selectedClipId={selectedReviewClipId}
          onSelectClip={setSelectedReviewClipId}
          onClose={() => { setIsReviewOpen(false); setResolveError(""); }}
          onResolve={resolveReview}
          onCreateProject={createProjectInline}
          resolvingClipId={resolvingClipId}
          resolveError={resolveError}
        />
      )}
    </main>
  );
}
