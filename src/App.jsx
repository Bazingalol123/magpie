import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  AlertTriangle,
  ArrowDown,
  ArrowRightLeft,
  ArrowUp,
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
  LayoutGrid,
  Layers3,
  Linkedin,
  ListFilter,
  LoaderCircle,
  LockKeyhole,
  LogOut,
  MessageCircle,
  Pause,
  Pencil,
  Play,
  Radio,
  Search,
  Target,
  Table2,
  Plus,
  RefreshCw,
  RotateCcw,
  Send,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  UserRound,
  Wand2,
  X,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { base44 } from "@/api/base44Client";
import { AgentIcon, EmptyNestIcon, PairingIcon } from "./components/icons.jsx";
import Landing from "./Landing.jsx";
import LoginPage from "./LoginPage.jsx";
import Docs from "./Docs.jsx";
import { isDocsRoute, parseDocsLocation } from "./docs-navigation.js";
import CaptureGuideDialog from "./onboarding/CaptureGuideDialog.jsx";
import { OnboardingStage, deriveOnboardingStage } from "./onboarding/state.js";
import { fetchAllPages } from "./dashboard-pagination.js";
import {
  PairingDisplayStatus,
  derivePairingDisplayStatus,
  hasActivePairing,
  needsPairingReconnect,
} from "./pairing-lifecycle.js";
import { searchWorkspace } from "./workspace-search.js";
import magpieMarkSrc from "./icon/magpie-mark.png";

const markdownComponents = {
  table: (props) => <div className="md-table-scroll"><table {...props} /></div>,
  a: (props) => <a {...props} target="_blank" rel="noreferrer" />,
};

const emptyData = { missions: [], collections: [], records: [], clips: [], enrichments: [], routingDecisions: [], watchRules: [], refreshAttempts: [], extensionInstalls: [] };
const emptyPageMeta = { hasMore: false, total: 0 };
const emptyDataMeta = {
  missions: emptyPageMeta,
  collections: emptyPageMeta,
  records: emptyPageMeta,
  clips: emptyPageMeta,
  enrichments: emptyPageMeta,
  routingDecisions: emptyPageMeta,
  watchRules: emptyPageMeta,
  refreshAttempts: emptyPageMeta,
  extensionInstalls: emptyPageMeta,
};

const EXTENSION_RELEASES_URL = "https://github.com/Bazingalol123/magpie/releases/latest";

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

// Color is status only, never category (docs/DESIGN_SYSTEM.md) -- this
// replaces an earlier hash-of-id dot color the owner rejected (docs/
// DECISIONS.md, "Dashboard redesign, R1"). A Collection gets a dot only
// when something real is currently true of it: a record mid-check right
// now (live), an unreachable source (error), or a source needing sign-in
// (review) -- in that priority order. No dot is the normal case.
function collectionDotStatus(collection, records, refreshingRecordId) {
  const collectionRecords = records.filter((record) => record.collection_id === collection.id);
  if (refreshingRecordId && collectionRecords.some((record) => record.id === refreshingRecordId)) return "live";
  if (collectionRecords.some((record) => record.freshness === "unreachable")) return "error";
  if (collectionRecords.some((record) => record.freshness === "blocked")) return "review";
  return null;
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

function relativeDate(value) {
  if (!value) return "not yet";
  const delta = Date.now() - new Date(value).getTime();
  if (!Number.isFinite(delta)) return formatDate(value);
  const minutes = Math.max(0, Math.round(delta / 60_000));
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return days < 14 ? `${days}d ago` : formatDate(value);
}

const CAPTURE_MODE_LABELS = {
  element: "Clip Element",
  selection: "Text Selection",
  page: "Save Page",
  link: "Link Capture",
  visual: "Snip Area",
  image: "Image Capture",
};

function recordTitle(record) {
  const fields = parseJson(record?.fields_json, {});
  return String(fields.title || fields.name || fields.product || fields.role || Object.values(fields).find(Boolean) || hostFromUrl(record?.source_url));
}

function clipTitle(clip) {
  if (!clip) return "Untitled capture";
  const summary = clip.summary || clip.raw_text || "";
  const first = summary.split(/[\r\n.!?]/).map((item) => item.trim()).find(Boolean);
  return first ? truncate(first, 72) : hostFromUrl(clip.source_url);
}

function hostFromUrl(value) {
  try {
    return new URL(value).hostname.replace(/^www\./, "");
  } catch {
    return "source page";
  }
}

// Real favicons read as a real product tracking real sites; the letter
// square is only a fallback for hosts a favicon service can't resolve.
function SourceFavicon({ url, large }) {
  const host = hostFromUrl(url);
  const hasHost = Boolean(host) && host !== "source page";
  const [failed, setFailed] = useState(false);
  const sizeClass = large ? " source-favicon-lg" : "";
  if (!hasHost || failed) {
    return <span className={`source-favicon${sizeClass}`}>{hasHost ? host.charAt(0).toUpperCase() : "?"}</span>;
  }
  return (
    <img
      className={`source-favicon is-image${sizeClass}`}
      src={`https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=64`}
      alt=""
      loading="lazy"
      onError={() => setFailed(true)}
    />
  );
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
  if (!isHttpUrl(value)) return <span dir="auto">{String(value)}</span>;
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

// Cards need a captured screenshot to earn their extra visual weight over a
// dense Table row; a favicon (rendered separately by SourceFavicon) doesn't
// count, only a real clip screenshot does.
function collectionHasCapturedImages(records, clips) {
  const clipsById = new Map(clips.map((clip) => [clip.id, clip]));
  return records.some((record) => !!screenshotUrlFor(clipsById.get(record.clip_id)));
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
  const dragEvidence = (event, fallback) => {
    const selected = window.getSelection?.().toString().trim();
    event.dataTransfer.setData("text/plain", selected || fallback);
    event.dataTransfer.effectAllowed = "copy";
  };
  return (
    <div className="clip-context">
      <div><FileText size={14} /> {clip.summary ? "Summary" : "Captured context"}</div>
      <p draggable onDragStart={(event) => dragEvidence(event, preview)} title="Select text, then drag it onto a field">{preview}</p>
      {hasMore && (
        <details className="clip-raw-toggle">
          <summary>View full captured text</summary>
          <p draggable onDragStart={(event) => dragEvidence(event, clip.raw_text)} title="Select text, then drag it onto a field">{clip.raw_text}</p>
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
          <div><div className="eyebrow"><PairingIcon size={13} /> browser pairing</div><h2>Connect this extension</h2></div>
          <button className="icon-button" onClick={onClose} aria-label="Close"><X size={19} /></button>
        </div>
        <p>Copy both values into the Magpie extension's side panel. Keep this window open: it closes when the server sees this extension use the pairing.</p>
        <div className="pairing-value"><span>Ingest function URL</span><code>{pairing.ingest_url}</code><button onClick={() => copy(pairing.ingest_url, "URL copied")}><Copy size={14} /> Copy</button></div>
        <div className="pairing-value token"><span>Paired extension token</span><code>{pairing.token}</code><button onClick={() => copy(pairing.token, "Token copied")}><Copy size={14} /> Copy</button></div>
        <div className="pairing-note"><ShieldCheck size={16} /> This token can only submit clips to your library. It cannot read anything from Magpie.</div>
        <div className="pairing-note"><Download size={16} /> Don't have the extension yet? <a href={EXTENSION_RELEASES_URL} target="_blank" rel="noreferrer">Download it</a>, then paste these values into its side panel.</div>
        <div className="pairing-actions"><span>{copied || "Waiting for the extension…"}</span><button className="secondary-button" onClick={onClose}>Finish later</button></div>
      </section>
    </div>
  );
}

const PAIRING_STATUS_COPY = {
  [PairingDisplayStatus.AWAITING_SETUP]: {
    label: "Awaiting setup",
    detail: "The token was created, but no Extension has confirmed it yet.",
  },
  [PairingDisplayStatus.CONNECTED_UNUSED]: {
    label: "Connected",
    detail: "The Extension connected successfully. No captures yet.",
  },
  [PairingDisplayStatus.ACTIVE]: {
    label: "Active",
    detail: "This browser has captured successfully.",
  },
  [PairingDisplayStatus.REVOKED]: {
    label: "Revoked",
    detail: "This token can no longer submit captures.",
  },
};

function PairingManagementDialog({ pairings, onClose, onPair, isPairing, onRevoke, onRevokeAll, revokingId, isRevokingAll, error }) {
  const [confirmingId, setConfirmingId] = useState(null);
  const [confirmAll, setConfirmAll] = useState(false);
  const activeCount = pairings.filter((pairing) => pairing.active !== false).length;

  const revokeOne = async (id) => {
    if (await onRevoke(id)) setConfirmingId(null);
  };
  const revokeAll = async () => {
    if (await onRevokeAll()) setConfirmAll(false);
  };

  return (
    <div className="detail-overlay pairing-overlay" role="presentation" onMouseDown={onClose}>
      <section className="pairing-dialog pairing-management-dialog" role="dialog" aria-modal="true" aria-label="Connected browsers" onMouseDown={(event) => event.stopPropagation()}>
        <div className="detail-head">
          <div><div className="eyebrow"><PairingIcon size={13} /> extension access</div><h2>Connected browsers</h2></div>
          <button className="icon-button" onClick={onClose} aria-label="Close"><X size={19} /></button>
        </div>
        <p>Each browser has its own write-only token. Creating a new connection never disconnects another browser.</p>
        {error && <div className="review-error pairing-management-error">{error}</div>}
        <div className="pairing-management-list">
          {pairings.length === 0 && <div className="pairing-empty"><PairingIcon size={22} /><div><b>No browsers paired</b><span>Pair the Chrome Extension to start capturing from the web. Don't have it yet? <a href={EXTENSION_RELEASES_URL} target="_blank" rel="noreferrer">Download the extension</a>.</span></div></div>}
          {pairings.map((install) => {
            const status = derivePairingDisplayStatus(install);
            const copy = PAIRING_STATUS_COPY[status];
            const isConfirming = confirmingId === install.id;
            const isBusy = revokingId === install.id;
            return (
              <article className={`pairing-install is-${status}`} key={install.id}>
                <div className="pairing-install-main">
                  <span className="pairing-install-icon"><PairingIcon size={18} /></span>
                  <div>
                    <div className="pairing-install-title"><b>{install.label}</b><span>{copy.label}</span></div>
                    <p>{copy.detail}</p>
                    <div className="pairing-install-meta"><span>Created {formatDate(install.created_at)}</span><span>Last used {relativeDate(install.last_used_at)}</span></div>
                  </div>
                </div>
                {install.active !== false && !isConfirming && <button type="button" className="text-button danger-text" onClick={() => setConfirmingId(install.id)} disabled={!!revokingId || isRevokingAll}>Revoke</button>}
                {isConfirming && (
                  <div className="pairing-inline-confirm">
                    <span>This browser will stop capturing immediately.</span>
                    <button type="button" className="secondary-button" onClick={() => setConfirmingId(null)} disabled={isBusy}>Cancel</button>
                    <button type="button" className="danger-button" onClick={() => revokeOne(install.id)} disabled={isBusy}>{isBusy ? <LoaderCircle className="spin" size={14} /> : <Trash2 size={14} />} Confirm revoke</button>
                  </div>
                )}
              </article>
            );
          })}
        </div>
        <div className="pairing-management-actions">
          <button type="button" className="primary-button" onClick={onPair} disabled={isPairing || !!revokingId || isRevokingAll}>{isPairing ? <LoaderCircle className="spin" size={14} /> : <Plus size={14} />} Pair another browser</button>
          {activeCount > 0 && !confirmAll && <button type="button" className="text-button danger-text" onClick={() => setConfirmAll(true)} disabled={!!revokingId || isRevokingAll}>Revoke every browser</button>}
          {activeCount > 0 && confirmAll && (
            <div className="pairing-revoke-all-confirm">
              <span>All {activeCount} active browser{activeCount === 1 ? "" : "s"} will need to reconnect.</span>
              <button type="button" className="secondary-button" onClick={() => setConfirmAll(false)} disabled={isRevokingAll}>Cancel</button>
              <button type="button" className="danger-button" onClick={revokeAll} disabled={isRevokingAll}>{isRevokingAll ? <LoaderCircle className="spin" size={14} /> : <Trash2 size={14} />} Revoke all</button>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

function PairingReconnectNotice({ onManage, onPair, isPairing }) {
  return (
    <div className="pairing-reconnect-notice" role="status">
      <span className="pairing-reconnect-icon"><AlertTriangle size={17} /></span>
      <div><b>Your browser connection needs attention.</b><span>Every saved Extension token is revoked. Reconnect to capture from Chrome again.</span></div>
      <button type="button" className="secondary-button" onClick={onManage}>View browsers</button>
      <button type="button" className="primary-button" onClick={onPair} disabled={isPairing}>{isPairing ? <LoaderCircle className="spin" size={14} /> : <PairingIcon size={14} />} Reconnect</button>
    </div>
  );
}

function WatchDialog({ records, watchRules, initialRecordId, initialField, onClose, onSave, isSaving, error }) {
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
          <p>Your report is filed as {isHttpUrl(result.issue_url) ? <a href={result.issue_url} target="_blank" rel="noreferrer">issue #{result.issue_number} <ExternalLink size={12} /></a> : <>issue #{result.issue_number}</>}. No GitHub account needed on your end — we filed it for you.</p>
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

function WorkspaceSwitcher({ missions, activeMissionId, onSelect, onNewProject, onDelete, deletingId, collections, records, watchRules }) {
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
            const missionCollections = collections.filter((collection) => collection.mission_id === mission.id);
            const missionCollectionIds = new Set(missionCollections.map((collection) => collection.id));
            const missionRecords = records.filter((record) => record.mission_id === mission.id || missionCollectionIds.has(record.collection_id));
            const missionRecordIds = new Set(missionRecords.map((record) => record.id));
            const missionWatches = watchRules.filter((watch) => missionRecordIds.has(watch.record_id));
            const collectionCount = missionCollections.length;
            const itemCount = missionRecords.length;
            const watchCount = missionWatches.length;
            return (
              <div className="workspace-menu-row" key={mission.id}>
                <button role="menuitem" className={mission.id === activeMissionId ? "current" : ""} onClick={() => choose(mission.id)}>
                  <Target size={14} /> {mission.title} {mission.id === activeMissionId && <Check size={14} />}
                </button>
                {isConfirming ? (
                  <span className="workspace-menu-confirm">
                    <span><b>Delete {mission.title} permanently?</b> {collectionCount} Collection{collectionCount === 1 ? "" : "s"}, {itemCount} Item{itemCount === 1 ? "" : "s"}, and {watchCount} Watch{watchCount === 1 ? "" : "es"} will be removed with their captures and history. You'll return to Library.</span>
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
      <div className="empty-icon"><EmptyNestIcon size={25} /></div>
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

function CollectionSidebar({ collections, activeCollectionId, records, hasMoreRecords, onSelect, onDelete, deletingId, refreshingRecordId }) {
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
          // records is the whole (bounded) fetched set, not just the active
          // Collection's page, so every row -- not only the active one --
          // gets a real, live count. hasMoreRecords means the account-wide
          // fetch hit its ceiling, so any count here could be an
          // undercount; the "+" suffix says so honestly instead of
          // claiming a precise number.
          const count = records.filter((record) => record.collection_id === collection.id).length;
          const countLabel = `${count}${hasMoreRecords ? "+" : ""}`;
          const isConfirming = confirmingId === collection.id;
          const isDeleting = deletingId === collection.id;
          const dotStatus = collectionDotStatus(collection, records, refreshingRecordId);
          return (
            <div className={`collection-item ${isActive ? "active" : ""}`} key={collection.id}>
              <button className="collection-select" onClick={() => onSelect(collection.id)}>
                <span className={`collection-dot${dotStatus ? ` is-${dotStatus}` : ""}`} />
                <span className="collection-name">{collection.name}</span>
                <span className="collection-count">{countLabel}</span>
              </button>
              {isConfirming ? (
                <span className="collection-confirm">
                  <span>{`Delete ${countLabel} Item${count === 1 && !hasMoreRecords ? "" : "s"}?`}</span>
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

const WORKSPACE_VIEWS = [
  { id: "nest", label: "Nest", icon: Inbox },
  { id: "library", label: "Library", icon: Layers3 },
  { id: "signals", label: "Signals", icon: Radio },
  { id: "search", label: "Search", icon: Search },
];

function AppNavigation({ activeView, onNavigate, needsReviewCount, signalCount, collections, activeCollectionId, records, clips, refreshingRecordId, onSelectCollection, user, onPair, onManagePairings, isPairing, hasPairingHistory, hasActiveExtension, onOpenDocs, onSignOut }) {
  const pairingAction = hasPairingHistory ? onManagePairings : onPair;
  const pairingLabel = !hasPairingHistory ? "Pair extension" : hasActiveExtension ? "Connected browsers" : "Reconnect browser";
  return (
    <aside className="app-navigation">
      <button type="button" className="nav-brand" onClick={() => onNavigate("nest")}><MagpieMark size={27} /><span>magpie</span><i>beta</i></button>
      <nav className="primary-nav" aria-label="Workspace">
        {WORKSPACE_VIEWS.map(({ id, label, icon: Icon }) => {
          const count = id === "nest" ? needsReviewCount : id === "signals" ? signalCount : 0;
          return (
            <button type="button" key={id} className={activeView === id ? "active" : ""} onClick={() => onNavigate(id)}>
              <Icon size={16} /><span>{label}</span>{count > 0 && <b>{count}</b>}{id === "search" && <kbd>⌘K</kbd>}
            </button>
          );
        })}
      </nav>
      <div className="nav-collections">
        <div className="nav-section-label"><span>collections</span><span>{collections.length}</span></div>
        <div className="nav-collection-list">
          {collections.map((collection) => {
            const status = collectionDotStatus(collection, records, refreshingRecordId);
            const count = collection.collection_type === "saved_search"
              ? searchWorkspace({ query: collection.saved_query, records, clips, collections }).items.length
              : records.filter((record) => record.collection_id === collection.id).length;
            return (
              <button type="button" key={collection.id} className={activeView === "library" && activeCollectionId === collection.id ? "active" : ""} onClick={() => onSelectCollection(collection.id)}>
                <span className={`collection-dot${status ? ` is-${status}` : ""}`} />
                <span>{collection.name}</span>
                <small>{count}</small>
              </button>
            );
          })}
        </div>
      </div>
      <div className="nav-account">
        <button type="button" onClick={pairingAction} disabled={isPairing}>{isPairing ? <LoaderCircle className="spin" size={14} /> : <PairingIcon size={14} />} {pairingLabel}</button>
        <button type="button" onClick={onOpenDocs}><Book size={14} /> Docs</button>
        <a href={EXTENSION_RELEASES_URL} target="_blank" rel="noreferrer"><Download size={14} /> Download extension</a>
        <div className="nav-user"><span><UserRound size={14} /> {user.full_name || user.email}</span><button type="button" onClick={onSignOut} aria-label="Sign out"><LogOut size={14} /></button></div>
        <p><LockKeyhole size={12} /> Owner-scoped by design</p>
      </div>
    </aside>
  );
}

function NestCard({ clip, decision, collections, onResolve, onOpenAdvanced, isBusy }) {
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

function CaptureSourceOffer({ isFirstRun, hasPairedExtension, onPair, isPairing, onPaste, onIos, onOpenLibrary, onOpenGuide }) {
  if (!isFirstRun) {
    return (
      <section className="capture-source-offer is-caught-up">
        <div className="capture-offer-copy">
          <div className="eyebrow">all caught up</div>
          <h2>Nothing needs your decision.</h2>
          <p>Confident captures are already in Collections. Add another page, or browse everything Magpie filed for you.</p>
          <div className="capture-offer-actions">
            <button type="button" className="primary-button" onClick={onPaste}><Plus size={14} /> Add capture</button>
            <button type="button" className="secondary-button" onClick={onOpenLibrary}><Layers3 size={14} /> Browse Collections</button>
            {!hasPairedExtension && <button type="button" className="text-button" onClick={onPair} disabled={isPairing}>{isPairing ? <LoaderCircle className="spin" size={14} /> : <PairingIcon size={14} />} Pair extension</button>}
          </div>
        </div>
        <div className="caught-up-mark" aria-hidden="true"><Check size={28} /></div>
      </section>
    );
  }
  return (
    <section className="capture-source-offer">
      <div className="capture-offer-copy">
        <div className="eyebrow">start here</div>
        <h2>Bring in one page. Magpie handles the filing.</h2>
        <p>Nest only holds captures that need your decision. Confident captures go straight to Collections, whether they come from the extension, your phone, or a pasted link.</p>
        <div className="capture-offer-actions"><button type="button" className="primary-button" onClick={onPair} disabled={isPairing}>{isPairing ? <LoaderCircle className="spin" size={14} /> : <PairingIcon size={14} />} Pair extension</button><button type="button" className="secondary-button" onClick={onPaste}><Plus size={14} /> Paste a link</button><button type="button" className="text-button" onClick={onIos}>Use iPhone / iPad</button></div>
      </div>
      <div className="capture-guide-invite">
        <img src="/onboarding/mode-element.gif" alt="The extension highlighting one listing before capture" />
        <div><span>60-second walkthrough</span><b>See every capture mode at a useful size.</b><button type="button" className="secondary-button" onClick={onOpenGuide}>Open capture guide <ChevronRight size={14} /></button></div>
      </div>
    </section>
  );
}

function NestSurface({ clips, decisionsByClip, collections, allClips, isFirstRun, hasPairedExtension, resolvingClipId, resolveError, onResolve, onOpenAdvanced, onPair, isPairing, onPaste, onIos, onOpenLibrary, onOpenGuide }) {
  const recentAutoFiled = allClips.filter((clip) => clip.routing_status !== "needs_review" && Date.now() - new Date(clip.captured_at || clip.created_date).getTime() < 60 * 60 * 1000).length;
  return (
    <section className="workspace-surface nest-surface">
      <header className="surface-header"><div><div className="eyebrow">needs your decision</div><h1>Nest</h1><p>{clips.length ? `${clips.length} capture${clips.length === 1 ? "" : "s"} Magpie wouldn't guess about. Everything it was sure of is already filed.` : "Nothing is waiting. Confident captures file straight into the Library."}</p></div><span className="surface-count">{clips.length}</span></header>
      {resolveError && <div className="error-banner">{resolveError}</div>}
      {clips.length ? <><div className="mobile-triage-progress"><span>1 of {clips.length}</span><span>Swipe right to keep · left to re-route</span></div><div className="nest-list">{clips.map((clip) => <NestCard key={clip.id} clip={clip} decision={decisionsByClip.get(clip.id)} collections={collections} onResolve={onResolve} onOpenAdvanced={onOpenAdvanced} isBusy={resolvingClipId === clip.id} />)}</div></> : <CaptureSourceOffer isFirstRun={isFirstRun} hasPairedExtension={hasPairedExtension} onPair={onPair} isPairing={isPairing} onPaste={onPaste} onIos={onIos} onOpenLibrary={onOpenLibrary} onOpenGuide={onOpenGuide} />}
      {recentAutoFiled > 0 && <p className="nest-auto-filed"><span className="live-dot" /> {recentAutoFiled} more capture{recentAutoFiled === 1 ? "" : "s"} arrived and filed {recentAutoFiled === 1 ? "itself" : "themselves"}. {recentAutoFiled === 1 ? "It's" : "They're"} in the Library, not here.</p>}
    </section>
  );
}

function signalTypeFor(record, enrichment) {
  if (enrichment?.agent_id === "extension-refresh-v1") return "revisit";
  if (enrichment) return "changed";
  if (record?.freshness === "blocked") return "blocked";
  if (record?.freshness === "unreachable") return "error";
  return "changed";
}

function SignalsSurface({ records, enrichments, watchRules, refreshAttempts, onSelectRecord, onToggleWatch, togglingWatchId, onCreateWatch }) {
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

function HighlightedText({ text, query }) {
  const clean = String(query || "").trim();
  if (!clean) return <>{text}</>;
  const terms = clean.split(/\s+/).filter((term) => term.length > 1 && !/^(under|below|over|above|at|least|most|max|min)$/i.test(term));
  if (!terms.length) return <>{text}</>;
  const expression = new RegExp(`(${terms.map((term) => term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`, "ig");
  return <>{String(text).split(expression).map((part, index) => terms.some((term) => part.toLowerCase() === term.toLowerCase()) ? <mark key={index}>{part}</mark> : part)}</>;
}

function SearchSurface({ records, clips, collections, missions, onSelectRecord, onSelectCollection, onAddCapture, onCreateProject, onCreateWatch, onAsk, onSaveSearch, onExit, focusVersion }) {
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

function CollectionDeleteControl({ collection, itemCount, watchCount, onDelete, isDeleting, mobile = false }) {
  const [isConfirming, setIsConfirming] = useState(false);
  useEffect(() => setIsConfirming(false), [collection?.id]);
  if (!collection) return null;
  return (
    <div className={`collection-delete-control${mobile ? " is-mobile" : ""}`}>
      <button type="button" className="icon-button collection-delete-trigger" onClick={() => setIsConfirming(true)} aria-label={`Delete ${collection.name}`}><Trash2 size={14} /></button>
      {isConfirming && <div className="collection-delete-popover" role="alertdialog" aria-label={`Delete ${collection.name} permanently`}>
        <b>Delete {collection.name} permanently?</b>
        <span>{itemCount} Item{itemCount === 1 ? "" : "s"} and {watchCount} Watch{watchCount === 1 ? "" : "es"} will be removed with their captures and history.</span>
        <div><button type="button" className="danger-button" disabled={isDeleting} onClick={async () => { await onDelete(collection.id); setIsConfirming(false); }}>{isDeleting ? <LoaderCircle className="spin" size={13} /> : <Trash2 size={13} />} Delete Collection</button><button type="button" className="text-button" disabled={isDeleting} onClick={() => setIsConfirming(false)}>Cancel</button></div>
      </div>}
    </div>
  );
}

function RecordTable({ collection, collections, records, totalCount = records.length, clips, enrichments, watchRules, displayMode = "cards", page, hasMore, onPageChange, onSelect, onSelectCollection, onDeleteCollection, isDeletingCollection, collectionDeleteSummary, onOpenOnboardingTour, refreshingRecordId, onDisplayModeChange, onAsk }) {
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

function RecordCardGrid({ records, columns, clipsById, enrichments = [], watchRules = [], onSelect, changedFirst = false, selectedRecordIds = [], onToggleSelected }) {
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
    <div className="card-grid">
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

function ComparisonPanel({ collection, records, watchRules, onClose, onOpenRecord, onAsk }) {
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

function ActivityPanel({ enrichments, records, onSelect, onClose }) {
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

const CHECKING_STAGES = ["Checking…", "Still checking — some sources are slow…", "Almost done…"];

function RecordDetail({ record, clip, enrichments, watch, onClose, onRefresh, isRefreshing, onStatus, refreshNotice, onDelete, isDeleting, onToggleWatch, onCreateWatch, isTogglingWatch, onCorrectField }) {
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
        <aside className="detail-panel review-panel" role="dialog" aria-modal="true" aria-label="Nest" onMouseDown={(event) => event.stopPropagation()}>
          <div className="detail-head">
            <div><div className="eyebrow"><Inbox size={13} /> nest</div><h2>Nothing waiting</h2></div>
            <button className="icon-button" onClick={onClose} aria-label="Close"><X size={19} /></button>
          </div>
          <p className="review-empty">Every capture is organized. New ambiguous captures will appear here.</p>
        </aside>
      </div>
    );
  }

  return (
    <div className="detail-overlay" role="presentation" onMouseDown={onClose}>
      <aside className="detail-panel review-panel" role="dialog" aria-modal="true" aria-label="Nest" onMouseDown={(event) => event.stopPropagation()}>
        <div className="detail-head">
          <div><div className="eyebrow"><Inbox size={13} /> nest · {clips.length}</div><h2>Organize this capture</h2></div>
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

        {isHttpUrl(selectedClip.source_url) && <a className="source-link" href={selectedClip.source_url} target="_blank" rel="noreferrer"><ExternalLink size={14} /> {hostFromUrl(selectedClip.source_url)}</a>}
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
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [history, setHistory] = useState([]);
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
    setIsHistoryOpen(false);
    setIsLoadingConversation(true);
    try {
      await createConversation();
    } catch (createError) {
      setError(createError.message || "The Magpie Agent is not available in this environment yet.");
    } finally {
      setIsLoadingConversation(false);
    }
  };

  const openHistory = async () => {
    setIsHistoryOpen(true);
    setIsLoadingHistory(true);
    setError("");
    try {
      const list = await base44.agents.listConversations({
        q: { agent_name: "magpie_organizer" },
        sort: "-updated_date",
        limit: 25,
      });
      setHistory(list);
    } catch (historyError) {
      setError(historyError.message || "Could not load conversation history.");
    } finally {
      setIsLoadingHistory(false);
    }
  };

  const resumeConversation = async (conversationId) => {
    if (conversationId === conversation?.id) {
      setIsHistoryOpen(false);
      return;
    }
    setError("");
    setIsHistoryOpen(false);
    setIsLoadingConversation(true);
    try {
      const full = await base44.agents.getConversation(conversationId);
      setConversation(full ?? null);
    } catch (resumeError) {
      setError(resumeError.message || "Could not load that conversation.");
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
            <div><div className="eyebrow"><AgentIcon size={12} /> evidence-grounded agent</div><h2>Ask Magpie</h2></div>
          </div>
          <div className="agent-head-actions">
            <button
              className={`icon-button${isHistoryOpen ? " active" : ""}`}
              onClick={() => (isHistoryOpen ? setIsHistoryOpen(false) : openHistory())}
              aria-label="Conversation history"
              title="Conversation history"
            >
              <Clock3 size={16} />
            </button>
            <button className="agent-new-button" onClick={startNewConversation} disabled={isLoadingConversation}>New chat</button>
            <button className="icon-button" onClick={onClose} aria-label="Close Magpie Agent"><X size={19} /></button>
          </div>
        </header>
        <div className="agent-context"><CircleDot size={12} /><span>Context: {contextLabel}</span></div>

        {isHistoryOpen ? (
          <section className="agent-history" aria-label="Conversation history">
            {isLoadingHistory ? (
              <div className="agent-loading"><LoaderCircle className="spin" size={19} /> Loading history…</div>
            ) : history.length ? history.map((item) => {
              const last = (item.messages ?? []).filter((message) => !message.hidden && messageText(message.content)).at(-1);
              return (
                <button
                  type="button"
                  key={item.id}
                  className={`agent-history-row${item.id === conversation?.id ? " active" : ""}`}
                  onClick={() => resumeConversation(item.id)}
                >
                  <span className="agent-history-preview">{last ? messageText(last.content) : "New conversation"}</span>
                  <span className="agent-history-date">{relativeDate(item.updated_date)}</span>
                </button>
              );
            }) : (
              <div className="agent-history-empty">No past conversations with Magpie yet.</div>
            )}
          </section>
        ) : (
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
        )}

        {error && <div className="agent-error">{error}</div>}
        {!isHistoryOpen && <form className="agent-composer" onSubmit={sendMessage}>
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
        </form>}
        <footer className="agent-foot"><ShieldCheck size={12} /> Owner-scoped tools. No direct database authority.</footer>
      </aside>
    </div>
  );
}

function isSafeHttpUrl(value) {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

function readShareDraft() {
  const params = new URLSearchParams(window.location.search);
  const direct = { url: params.get("url") || "", text: params.get("text") || "", title: params.get("title") || "" };
  if (direct.url || direct.text || direct.title) {
    try { sessionStorage.setItem("magpie.share.draft", JSON.stringify(direct)); } catch { /* storage can be unavailable */ }
    return direct;
  }
  try { return JSON.parse(sessionStorage.getItem("magpie.share.draft") || "null") || direct; } catch { return direct; }
}

function workspaceViewFromPath(pathname) {
  const segment = pathname.split("/").filter(Boolean)[0];
  return WORKSPACE_VIEWS.some((view) => view.id === segment) ? segment : "library";
}

function ShareCapturePage({ draft, onSubmit, isSubmitting, error, result }) {
  const [note, setNote] = useState(draft.text || draft.title || "");
  const [intent, setIntent] = useState("reference");
  const submit = async (event) => {
    event.preventDefault();
    await onSubmit({ source_url: draft.url, raw_text: note, capture_intent: intent });
  };
  return (
    <main className="share-capture-shell">
      <section className="share-capture-card">
        <div className="eyebrow"><ShieldCheck size={13} /> shared with Magpie</div>
        <h1>Save this for later.</h1>
        <p>Magpie received this page from your phone. Add a short note and we’ll organize it in your workspace.</p>
        <div className="share-source"><span>Source</span>{isSafeHttpUrl(draft.url) ? <a href={draft.url} target="_blank" rel="noreferrer">{hostFromUrl(draft.url)}</a> : <span>{draft.url || "Shared content"}</span>}</div>
        <form className="mobile-capture-form" onSubmit={submit}>
          <label>Why does this matter?<textarea value={note} onChange={(event) => setNote(event.target.value)} placeholder="What should Magpie remember?" rows="4" required /></label>
          <label>Intent<select value={intent} onChange={(event) => setIntent(event.target.value)}><option value="reference">Keep for reference</option><option value="compare">Compare later</option><option value="watch">Watch for changes</option><option value="act">Act on this</option></select></label>
          {error && <div className="review-error">{error}</div>}
          {result && <div className="refresh-notice success">{result.duplicate ? "Already saved in your workspace." : result.routing_status === "needs_review" ? "Saved to Nest." : "Saved. Magpie is organizing it now."}</div>}
          <button className="primary-button" type="submit" disabled={isSubmitting}>{isSubmitting ? <LoaderCircle className="spin" size={15} /> : <Plus size={15} />} {isSubmitting ? "Saving…" : "Save to Magpie"}</button>
        </form>
      </section>
    </main>
  );
}

function MobileCaptureDialog({ onClose, onSubmit, isSubmitting, error, result, missions, activeMissionId }) {
  const [url, setUrl] = useState("");
  const [note, setNote] = useState("");
  const [intent, setIntent] = useState("reference");
  const [missionId, setMissionId] = useState(activeMissionId || "");
  return (
    <div className="detail-overlay" role="presentation" onMouseDown={onClose}>
      <aside className="detail-panel mobile-capture-panel" role="dialog" aria-modal="true" aria-label="Add a memory" onMouseDown={(event) => event.stopPropagation()}>
        <div className="detail-head"><div><div className="eyebrow"><Plus size={13} /> mobile capture</div><h2>Add something to Magpie</h2></div><button className="icon-button" onClick={onClose} aria-label="Close"><X size={19} /></button></div>
        <p className="mobile-capture-intro">Save a link and why it matters. Magpie will organize it into your workspace.</p>
        <form className="mobile-capture-form" onSubmit={(event) => { event.preventDefault(); onSubmit({ source_url: url, raw_text: note, capture_intent: intent, mission_id: missionId }); }}>
          <label>URL<input type="url" value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://…" required /></label>
          <label>Note<textarea value={note} onChange={(event) => setNote(event.target.value)} placeholder="What should Magpie remember?" rows="5" required /></label>
          <label>Intent<select value={intent} onChange={(event) => setIntent(event.target.value)}><option value="reference">Keep for reference</option><option value="compare">Compare later</option><option value="watch">Watch for changes</option><option value="act">Act on this</option></select></label>
          <label>Save to<select value={missionId} onChange={(event) => setMissionId(event.target.value)}><option value="">Library — no Project</option>{missions.map((mission) => <option value={mission.id} key={mission.id}>{mission.title}</option>)}</select></label>
          {error && <div className="review-error">{error}</div>}
          {result && <div className="refresh-notice success">{result.duplicate ? "This capture was already saved." : result.routing_status === "needs_review" ? "Saved to Nest. Magpie needs a little more information before filing it." : "Saved. Magpie is organizing this capture now."}</div>}
          <button className="primary-button" type="submit" disabled={isSubmitting}>{isSubmitting ? <LoaderCircle className="spin" size={15} /> : <Plus size={15} />} {isSubmitting ? "Saving…" : "Save to workspace"}</button>
        </form>
      </aside>
    </div>
  );
}

export default function App() {
  const [user, setUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [, forceRouteRender] = useState(0);
  const [shareDraft, setShareDraft] = useState(() => readShareDraft());
  const isLoginRoute = window.location.pathname === "/login";
  const isShareRoute = window.location.pathname === "/share";
  const shareId = isShareRoute ? new URLSearchParams(window.location.search).get("share_id") : null;
  const shareRedirectPath = shareId ? `/share?share_id=${encodeURIComponent(shareId)}` : "/share";
  const [data, setData] = useState(emptyData);
  const [dataMeta, setDataMeta] = useState(emptyDataMeta);
  const [activeView, setActiveView] = useState(() => workspaceViewFromPath(window.location.pathname));
  const [searchFocusVersion, setSearchFocusVersion] = useState(0);
  const [dismissedGuides, setDismissedGuides] = useState({ routing: false, watch: false, ask: false });
  const [activeCollectionId, setActiveCollectionId] = useState(null);
  const [recordPage, setRecordPage] = useState(0);
  const [collectionDisplayModes, setCollectionDisplayModes] = useState({});
  const activeCollectionIdRef = useRef(null);
  const dashboardLoadRef = useRef(null);
  const [activeMissionId, setActiveMissionId] = useState("");
  const [selectedRecord, setSelectedRecord] = useState(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isPairing, setIsPairing] = useState(false);
  const [pairing, setPairing] = useState(null);
  const [isPairingManagementOpen, setIsPairingManagementOpen] = useState(false);
  const [pairingManagementError, setPairingManagementError] = useState("");
  const [revokingInstallationId, setRevokingInstallationId] = useState(null);
  const [isRevokingAllPairings, setIsRevokingAllPairings] = useState(false);
  const [routingUndo, setRoutingUndo] = useState(null);
  const [isCreatingMission, setIsCreatingMission] = useState(false);
  const [isProjectDialogOpen, setIsProjectDialogOpen] = useState(false);
  const [isCaptureGuideOpen, setIsCaptureGuideOpen] = useState(false);
  const [isAgentOpen, setIsAgentOpen] = useState(false);
  const [isActivityOpen, setIsActivityOpen] = useState(false);
  const [isAccountMenuOpen, setIsAccountMenuOpen] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [refreshNotice, setRefreshNotice] = useState(null);
  const [isReviewOpen, setIsReviewOpen] = useState(false);
  const [selectedReviewClipId, setSelectedReviewClipId] = useState(null);
  const [resolvingClipId, setResolvingClipId] = useState(null);
  const [resolveError, setResolveError] = useState("");
  const [isDeletingRecord, setIsDeletingRecord] = useState(false);
  const [isTogglingWatch, setIsTogglingWatch] = useState(false);
  const [togglingWatchId, setTogglingWatchId] = useState(null);
  const [watchDialog, setWatchDialog] = useState(null);
  const [isSavingWatch, setIsSavingWatch] = useState(false);
  const [watchDialogError, setWatchDialogError] = useState("");
  const [isMobileCaptureOpen, setIsMobileCaptureOpen] = useState(false);
  const [isMobileCapturing, setIsMobileCapturing] = useState(false);
  const [mobileCaptureError, setMobileCaptureError] = useState("");
  const [mobileCaptureResult, setMobileCaptureResult] = useState(null);
  const [deletingCollectionId, setDeletingCollectionId] = useState(null);
  const [deletingMissionId, setDeletingMissionId] = useState(null);
  const [isBugReportOpen, setIsBugReportOpen] = useState(false);
  const [isReportingBug, setIsReportingBug] = useState(false);
  const [bugReportError, setBugReportError] = useState("");
  const [bugReportResult, setBugReportResult] = useState(null);

  // One bounded fetch gets every owned Record up front (not just the
  // active Collection's page), so switching Collections/Projects is a pure
  // client-side filter -- instant, and always in sync with the same data
  // the realtime subscription below refreshes -- instead of firing a new
  // network request (and a blank/stale-count flash while it resolves)
  // every time. fetchAllPages pages to a bounded ceiling instead of
  // silently dropping rows past a single page (G1); it already existed for
  // this exact purpose but was never actually wired into loadDashboard.
  const loadDashboard = useCallback(async () => {
    const [missions, collections, recordsResult, clips, enrichments, routingDecisions, watchRules, refreshAttempts, extensionPairingsResponse] = await Promise.all([
      listDashboardPage(base44.entities.Mission, "-created_date"),
      listDashboardPage(base44.entities.Collection, "name"),
      fetchAllPages((skip, limit) => base44.entities.Record.list("-created_date", limit, skip)),
      listDashboardPage(base44.entities.Clip, "-captured_at"),
      listDashboardPage(base44.entities.Enrichment, "-checked_at"),
      listDashboardPage(base44.entities.RoutingDecision, "-decided_at"),
      listDashboardPage(base44.entities.WatchRule, "-created_date"),
      listDashboardPage(base44.entities.RefreshAttempt, "-requested_at"),
      base44.functions.invoke("list-extension-pairings", {}),
    ]);
    const records = recordsResult.items;
    const extensionInstalls = Array.isArray(extensionPairingsResponse.data?.pairings)
      ? extensionPairingsResponse.data.pairings
      : [];
    const selectedCollectionId = activeCollectionIdRef.current && collections.some((item) => item.id === activeCollectionIdRef.current)
      ? activeCollectionIdRef.current
      : collections[0]?.id ?? null;
    activeCollectionIdRef.current = selectedCollectionId;
    setActiveCollectionId(selectedCollectionId);
    setActiveMissionId((current) => current && missions.some((item) => item.id === current) ? current : "");
    const next = { missions, collections, records, clips, enrichments, routingDecisions, watchRules, refreshAttempts, extensionInstalls };
    setData(next);
    setDataMeta({
      missions: { hasMore: missions.length >= DASHBOARD_LIST_LIMIT, total: null },
      collections: { hasMore: collections.length >= DASHBOARD_LIST_LIMIT, total: null },
      records: { hasMore: recordsResult.hasMore, total: recordsResult.total },
      clips: { hasMore: clips.length >= DASHBOARD_LIST_LIMIT, total: null },
      enrichments: { hasMore: enrichments.length >= DASHBOARD_LIST_LIMIT, total: null },
      routingDecisions: { hasMore: routingDecisions.length >= DASHBOARD_LIST_LIMIT, total: null },
      watchRules: { hasMore: watchRules.length >= DASHBOARD_LIST_LIMIT, total: null },
      refreshAttempts: { hasMore: refreshAttempts.length >= DASHBOARD_LIST_LIMIT, total: null },
      extensionInstalls: { hasMore: extensionInstalls.length >= DASHBOARD_LIST_LIMIT, total: null },
    });
    return next;
  }, []);

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
    setActiveCollectionId(collectionId);
    setRecordPage(0);
    setActiveView("library");
    if (window.location.pathname !== "/library") window.history.pushState({}, "", "/library");
  }, []);

  const navigateWorkspace = useCallback((view) => {
    setActiveView(view);
    window.history.pushState({}, "", `/${view}`);
    if (view === "search") setSearchFocusVersion((version) => version + 1);
  }, []);

  const changeRecordPage = useCallback((page) => {
    setRecordPage(page);
  }, []);

  useEffect(() => {
    // A bfcache restore (event.persisted) resumes this exact JS heap and DOM
    // as they were before navigating away -- including a signed-in
    // dashboard's user/data state -- even if the session was signed out
    // in between (e.g. browser Back after Sign out). Patching just `user`
    // here left dependent data/collection state stale (an authenticated
    // shell with no data, 403s on every action) because those effects don't
    // re-run from a bfcache resume the way they do from a fresh mount. A
    // full reload forces the normal fresh-mount auth check instead.
    const onPageShow = (event) => {
      if (event.persisted) window.location.reload();
    };
    window.addEventListener("pageshow", onPageShow);
    return () => window.removeEventListener("pageshow", onPageShow);
  }, []);

  useEffect(() => {
    const onPopState = () => {
      setActiveView(workspaceViewFromPath(window.location.pathname));
      forceRouteRender((version) => version + 1);
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  useEffect(() => {
    if (!user) return undefined;
    const onKeyDown = (event) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        navigateWorkspace("search");
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [navigateWorkspace, user]);

  useEffect(() => {
    if (window.location.pathname !== "/share") return undefined;
    const shareId = new URLSearchParams(window.location.search).get("share_id");
    if (!shareId) return undefined;
    let cancelled = false;
    fetch(`/__magpie_share/${encodeURIComponent(shareId)}`)
      .then((response) => response.ok ? response.json() : null)
      .then((draft) => { if (!cancelled && draft) setShareDraft(draft); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let active = true;
    base44.auth.me()
      .then((currentUser) => active && setUser(currentUser))
      .catch(() => active && setUser(null))
      .finally(() => active && setIsLoading(false));
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (isLoading || user || !isShareRoute) return;
    base44.auth.loginWithProvider("google", shareRedirectPath);
  }, [isLoading, user, isShareRoute, shareRedirectPath]);

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
      base44.entities.RefreshAttempt.subscribe(debouncedLoad),
      base44.entities.ExtensionInstall.subscribe(debouncedLoad),
    ];
    return () => {
      cancelled = true;
      clearTimeout(debounceTimer);
      unsubscribers.forEach((unsubscribe) => unsubscribe());
    };
  }, [loadDashboard, user]);

  useEffect(() => {
    if (!pairing?.extension_id) return;
    const install = data.extensionInstalls.find((item) => item.id === pairing.extension_id);
    if (install?.paired_at || install?.last_used_at) setPairing(null);
  }, [data.extensionInstalls, pairing]);

  useEffect(() => {
    if (!routingUndo) return undefined;
    const timer = setTimeout(() => setRoutingUndo(null), 10_000);
    return () => clearTimeout(timer);
  }, [routingUndo]);

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

  useEffect(() => {
    // The OAuth provider round trip ends with a server-side redirect back to
    // `${appBaseUrl}/api/apps/auth/final-callback?state=...` (Base44's own
    // auth plumbing, not one of this app's routes). In production the
    // custom domain's real backend performs a further redirect to a clean
    // `from_url` before the SPA ever loads there. A local `npx base44 dev`
    // session has been observed leaving the browser sitting on that raw
    // `/api/apps/auth/*` URL (with its `state` JSON still in the query
    // string) instead -- the session itself is valid (`base44.auth.me()`
    // resolves fine), only the address bar is wrong. Strip it back to `/`
    // whenever any `/api/*` path leaks into the browser URL, regardless of
    // which auth path produced it (login or logout).
    if (!window.location.pathname.startsWith("/api/")) return;
    window.history.replaceState(null, "", "/");
    forceRouteRender((version) => version + 1);
  }, []);

  const openLogin = () => {
    window.history.pushState({}, "", "/login");
    forceRouteRender((version) => version + 1);
  };

  const closeLogin = () => {
    window.history.pushState({}, "", "/");
    forceRouteRender((version) => version + 1);
  };

  const handleAuthenticated = (authenticatedUser, redirectPath = "/") => {
    window.history.pushState({}, "", redirectPath);
    setActiveView(workspaceViewFromPath(redirectPath));
    forceRouteRender((version) => version + 1);
    setUser(authenticatedUser);
  };

  const handleSignIn = () => openLogin();

  const handleSignOut = () => {
    const publicOrigin = import.meta.env.VITE_PUBLIC_APP_URL || window.location.origin;
    base44.auth.logout(`${publicOrigin.replace(/\/$/, "")}/`);
  };

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

  const openPairingManagement = () => {
    setPairingManagementError("");
    setIsPairingManagementOpen(true);
  };

  const createPairingFromManagement = () => {
    setIsPairingManagementOpen(false);
    handleCreatePairing();
  };

  const revokeExtensionPairing = async (installationId) => {
    setRevokingInstallationId(installationId);
    setPairingManagementError("");
    try {
      await base44.functions.invoke("revoke-extension-pairing", { installation_id: installationId });
      await requestDashboardLoad();
      return true;
    } catch (error) {
      setPairingManagementError(error.response?.data?.error || error.message || "Could not revoke this browser.");
      return false;
    } finally {
      setRevokingInstallationId(null);
    }
  };

  const revokeAllExtensionPairings = async () => {
    setIsRevokingAllPairings(true);
    setPairingManagementError("");
    try {
      await base44.functions.invoke("revoke-all-extension-pairings", {});
      await requestDashboardLoad();
      return true;
    } catch (error) {
      setPairingManagementError(error.response?.data?.error || error.message || "Could not revoke the browser connections.");
      return false;
    } finally {
      setIsRevokingAllPairings(false);
    }
  };

  const submitMobileCapture = async (payload) => {
    setIsMobileCapturing(true);
    setMobileCaptureError("");
    setMobileCaptureResult(null);
    try {
      const { mission_id: requestedMissionId, ...capturePayload } = payload;
      const captureMissionId = requestedMissionId === undefined ? activeMissionId : requestedMissionId;
      const response = await base44.functions.invoke("mobile-capture", {
        ...capturePayload,
        ...(captureMissionId ? { mission_id: captureMissionId } : {}),
      });
      setMobileCaptureResult(response.data);
      if (window.location.pathname === "/share") {
        const shareId = new URLSearchParams(window.location.search).get("share_id");
        try { sessionStorage.removeItem("magpie.share.draft"); } catch { /* storage can be unavailable */ }
        if (shareId && navigator.serviceWorker.controller) navigator.serviceWorker.controller.postMessage({ type: "consume_share", id: shareId });
      }
      await requestDashboardLoad();
      return response.data;
    } catch (error) {
      setMobileCaptureError(error.response?.data?.error || error.message || "Could not save this capture.");
    } finally {
      setIsMobileCapturing(false);
    }
  };

  const refreshSelectedRecord = async (acquisitionStrategy = "direct_http") => {
    if (!selectedRecord) return;
    setIsRefreshing(true);
    setRefreshNotice(null);
    try {
      const response = await base44.functions.invoke("enrich-record", { record_id: selectedRecord.id, acquisition_strategy: acquisitionStrategy });
      setRefreshNotice(response.data);
      setSelectedRecord((current) => current ? {
        ...current,
        last_check_at: response.data.checked_at,
        enrichment_status: response.data.outcome,
      } : current);
      await requestDashboardLoad();
    } catch (error) {
      const status = error.response?.status;
      if (acquisitionStrategy === "zyte" && (status === 403 || status === 404)) {
        setRefreshNotice({ outcome: "blocked", message: "Zyte cloud refresh is not enabled for this workspace yet." });
      } else if (acquisitionStrategy === "owner_browser" && status === 409) {
        setRefreshNotice({ outcome: "blocked", message: "Open this source in the paired browser extension to refresh it." });
      } else {
        setLoadError(error.response?.data?.error || error.message || "Could not check this source.");
      }
    } finally {
      setIsRefreshing(false);
    }
  };

  const createMission = async (form) => {
    setIsCreatingMission(true);
    try {
      const response = await base44.functions.invoke("create-mission", form);
      const next = await requestDashboardLoad();
      const missionId = response.data.mission.id;
      const firstCollection = next.collections.find((collection) => collection.mission_id === missionId) ?? null;
      setActiveMissionId(missionId);
      activeCollectionIdRef.current = firstCollection?.id ?? null;
      setActiveCollectionId(firstCollection?.id ?? null);
      setRecordPage(0);
      setActiveView("library");
      window.history.pushState({}, "", "/library");
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
      const response = await base44.functions.invoke("resolve-routing", command);
      if (command.action === "accept" && response.data?.record_id) {
        const clip = data.clips.find((item) => item.id === clipId);
        setRoutingUndo({ clipId, title: clipTitle(clip), collectionName: data.routingDecisions.find((item) => item.clip_id === clipId)?.suggested_name || "a new Collection" });
      }
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
    if (!watch) return;
    const targetRecord = data.records.find((record) => record.id === watch.record_id);
    if (!targetRecord) return;
    setIsTogglingWatch(true);
    setTogglingWatchId(watch.id);
    try {
      await base44.functions.invoke("agent-configure-monitoring", {
        action: watch.active ? "pause" : "resume",
        record_id: targetRecord.id,
        watch_rule_id: watch.id,
      });
      await requestDashboardLoad();
    } catch (error) {
      setLoadError(error.response?.data?.error || error.message || "Could not update this watch.");
    } finally {
      setIsTogglingWatch(false);
      setTogglingWatchId(null);
    }
  };

  const openWatchDialog = (record = null, field = "") => {
    setWatchDialog({ recordId: record?.id || "", field });
    setWatchDialogError("");
  };

  const saveManualWatch = async ({ recordId, condition, frequency, acquisitionStrategy }) => {
    setIsSavingWatch(true);
    setWatchDialogError("");
    try {
      await base44.functions.invoke("agent-configure-monitoring", {
        action: "create",
        record_id: recordId,
        condition,
        frequency,
        acquisition_strategy: acquisitionStrategy,
      });
      await requestDashboardLoad();
      setWatchDialog(null);
    } catch (error) {
      setWatchDialogError(error.response?.data?.error || error.message || "Could not save this watch.");
    } finally {
      setIsSavingWatch(false);
    }
  };

  const undoRoutingResolution = async () => {
    if (!routingUndo) return;
    const pending = routingUndo;
    setRoutingUndo(null);
    try {
      await base44.functions.invoke("undo-routing-resolution", { clip_id: pending.clipId });
      await requestDashboardLoad();
      navigateWorkspace("nest");
    } catch (error) {
      setLoadError(error.response?.data?.error || error.message || "Could not undo that route.");
    }
  };

  const correctSelectedRecordField = async (field, expectedValue, newValue) => {
    if (!selectedRecord) return;
    const response = await base44.functions.invoke("correct-record-field", {
      record_id: selectedRecord.id,
      field,
      expected_value: expectedValue,
      new_value: newValue,
    });
    if (response.data.record) setSelectedRecord(response.data.record);
    await requestDashboardLoad();
    return response.data;
  };

  const createProjectInline = async (title) => {
    const response = await base44.functions.invoke("create-mission", { title });
    await requestDashboardLoad();
    return response.data.mission;
  };

  const openIosShortcutSetup = () => window.open("/?docs=ios-shortcut", "_blank", "noopener");

  const openMobileCapture = () => {
    setMobileCaptureError("");
    setMobileCaptureResult(null);
    setIsMobileCaptureOpen(true);
  };

  const saveWorkspaceSearch = async (query, name, missionId = "") => {
    const response = await base44.functions.invoke("create-saved-search", {
      query,
      name,
      ...(missionId ? { mission_id: missionId } : {}),
    });
    await requestDashboardLoad();
    setActiveMissionId(missionId);
    selectCollection(response.data.collection.id);
    return response.data.collection;
  };

  const activeMission = data.missions.find((mission) => mission.id === activeMissionId);
  const missionRecords = activeMission ? data.records.filter((record) => record.mission_id === activeMission.id) : data.records;
  // Global (no mission_id) Collections belong to the top-level Library, not
  // to every Project's sidebar -- showing them everywhere (#72) meant any
  // Collection unattached to a Mission appeared under every Project with a
  // 0 count. Only an explicitly Project-scoped Collection belongs in a
  // Project's list; the no-Project (Library) view still shows everything.
  const missionCollections = activeMission
    ? data.collections.filter((collection) => collection.mission_id === activeMission.id)
    : data.collections;
  const activeCollection = missionCollections.find((collection) => collection.id === activeCollectionId) ?? missionCollections[0];
  const activeCollectionRecords = activeCollection?.collection_type === "saved_search"
    ? searchWorkspace({ query: activeCollection.saved_query, records: missionRecords, clips: data.clips, collections: missionCollections }).items.map((item) => item.record)
    : missionRecords.filter((record) => record.collection_id === activeCollection?.id);
  const recordPageStart = recordPage * RECORDS_PAGE_SIZE;
  const activeRecords = activeCollectionRecords.slice(recordPageStart, recordPageStart + RECORDS_PAGE_SIZE);
  const activeCollectionHasMorePages = activeCollectionRecords.length > recordPageStart + RECORDS_PAGE_SIZE;
  const activeCollectionDefaultDisplayMode = collectionHasCapturedImages(activeCollectionRecords, data.clips) ? "cards" : "table";
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
      dismissed: !!user?.onboarding_dismissed,
    }),
    [data.extensionInstalls, data.clips, user?.onboarding_dismissed],
  );
  const isFirstRun = onboardingStage === OnboardingStage.NOT_PAIRED
    && data.collections.length === 0
    && data.records.length === 0
    && data.clips.length === 0;
  const hasPairingHistory = data.extensionInstalls.length > 0;
  const hasActiveExtension = hasActivePairing(data.extensionInstalls);
  const showPairingReconnect = needsPairingReconnect(data.extensionInstalls);
  const hasPairedExtension = data.extensionInstalls.some((install) => install.active !== false && !!(install.paired_at || install.last_used_at));
  const activeCollectionRecordIds = new Set(activeCollectionRecords.map((record) => record.id));
  const collectionDeleteSummary = {
    itemCount: activeCollectionRecords.length,
    watchCount: data.watchRules.filter((watch) => activeCollectionRecordIds.has(watch.record_id)).length,
  };
  useEffect(() => {
    // Guide a brand-new account from the bare root into the capture task, but
    // never trap it there. An explicit /library visit must render Library's
    // honest empty state even before the first Collection exists.
    if (user && isFirstRun && activeView === "library" && window.location.pathname === "/") {
      setActiveView("nest");
      window.history.replaceState({}, "", "/nest");
    }
  }, [activeView, isFirstRun, user]);
  const dismissOnboarding = async () => {
    // Tracked on the User record (base44.auth.updateMe), not localStorage:
    // a browser-local flag leaks across accounts sharing one browser (a
    // brand-new signup silently inherited a previous account's dismissal
    // in this same origin) and never follows a real user across devices.
    setUser((current) => (current ? { ...current, onboarding_dismissed: true } : current));
    try {
      await base44.auth.updateMe({ onboarding_dismissed: true });
    } catch (error) {
      setLoadError(error.response?.data?.error || error.message || "Could not save your onboarding preference.");
    }
  };
  const openOnboardingReview = (clipId) => {
    setSelectedReviewClipId(clipId);
    setIsReviewOpen(true);
  };

  if (isDocsRoute(window.location.href)) {
    return <Docs initialSlug={parseDocsLocation(window.location.href).slug} isSignedIn={!!user} isSigningIn={isSigningIn} onSignIn={handleSignIn} />;
  }

  if (isLoading) return <main className="app-loader"><LoaderCircle className="spin" size={24} /></main>;
  if (!user && isShareRoute) return <main className="app-loader"><LoaderCircle className="spin" size={24} /></main>;
  if (isShareRoute && user) return <ShareCapturePage draft={shareDraft} onSubmit={submitMobileCapture} isSubmitting={isMobileCapturing} error={mobileCaptureError} result={mobileCaptureResult} />;
  if (!user && isLoginRoute) return <LoginPage onBack={closeLogin} onAuthenticated={handleAuthenticated} redirectPath="/" />;
  if (!user) return <Landing isSigningIn={isSigningIn} onSignIn={handleSignIn} />;

  const selectProject = (missionId) => {
    setActiveMissionId(missionId);
    const scoped = missionId ? data.collections.filter((collection) => collection.mission_id === missionId) : data.collections;
    selectCollection(scoped[0]?.id ?? null);
  };
  const selectCollectionAnywhere = (collectionId) => {
    const collection = data.collections.find((item) => item.id === collectionId);
    setActiveMissionId(collection?.mission_id || "");
    selectCollection(collectionId);
  };
  const recentSignalCount = data.enrichments.filter((entry) => Date.now() - new Date(entry.checked_at).getTime() < 24 * 60 * 60 * 1000).length
    + data.records.filter((record) => record.freshness === "blocked" || record.freshness === "unreachable").length;
  const hasUnwatchedComparableItems = activeCollectionRecords.length >= 2 && activeCollectionRecords.some((record) => !data.watchRules.some((watch) => watch.record_id === record.id));

  return (
    <main className="app-shell redesign-shell">
      <AppNavigation
        activeView={activeView}
        onNavigate={navigateWorkspace}
        needsReviewCount={needsReviewClips.length}
        signalCount={recentSignalCount}
        collections={missionCollections}
        activeCollectionId={activeCollection?.id}
        records={missionRecords}
        clips={data.clips}
        refreshingRecordId={isRefreshing ? selectedRecord?.id : null}
        onSelectCollection={selectCollection}
        user={user}
        onPair={handleCreatePairing}
        onManagePairings={openPairingManagement}
        isPairing={isPairing}
        hasPairingHistory={hasPairingHistory}
        hasActiveExtension={hasActiveExtension}
        onOpenDocs={() => { window.open("/docs/getting-started", "_blank", "noopener"); }}
        onSignOut={handleSignOut}
      />
      <section className="workspace-main">
        <header className="mobile-workspace-header">
          <button type="button" className="nav-brand" onClick={() => navigateWorkspace("nest")}><MagpieMark size={25} /><span>magpie</span></button>
          <div><button type="button" className="icon-button" onClick={() => navigateWorkspace("search")} aria-label="Search"><Search size={18} /></button><button type="button" className="icon-button" onClick={() => setIsAccountMenuOpen((current) => !current)} aria-label="Account menu"><UserRound size={18} /></button></div>
          {isAccountMenuOpen && <div className="mobile-menu" role="menu"><button role="menuitem" onClick={() => { if (hasPairingHistory) openPairingManagement(); else handleCreatePairing(); setIsAccountMenuOpen(false); }}><PairingIcon size={15} /> {!hasPairingHistory ? "Pair extension" : hasActiveExtension ? "Connected browsers" : "Reconnect browser"}</button><a href="/docs/getting-started" role="menuitem" target="_blank" rel="noopener"><Book size={15} /> Docs</a><span role="menuitem" className="mobile-menu-account">{user.full_name || user.email}</span><button role="menuitem" onClick={handleSignOut}><LogOut size={15} /> Sign out</button></div>}
        </header>
        {loadError && <div className="error-banner workspace-error">{loadError}<button onClick={() => setLoadError("")}><X size={15} /></button></div>}
        {showPairingReconnect && <PairingReconnectNotice onManage={openPairingManagement} onPair={handleCreatePairing} isPairing={isPairing} />}
        {activeView === "nest" && <NestSurface clips={needsReviewClips} decisionsByClip={decisionsByClip} collections={data.collections} allClips={data.clips} isFirstRun={isFirstRun} hasPairedExtension={hasPairedExtension} resolvingClipId={resolvingClipId} resolveError={resolveError} onResolve={resolveReview} onOpenAdvanced={(clipId) => { setSelectedReviewClipId(clipId); setIsReviewOpen(true); }} onPair={handleCreatePairing} isPairing={isPairing} onPaste={openMobileCapture} onIos={openIosShortcutSetup} onOpenLibrary={() => navigateWorkspace("library")} onOpenGuide={() => setIsCaptureGuideOpen(true)} />}
        {activeView === "library" && (
          <section className="workspace-surface library-surface">
            <div className="mobile-library-context">
              <div className="eyebrow">organized automatically</div>
              <WorkspaceSwitcher missions={data.missions} collections={data.collections} records={data.records} watchRules={data.watchRules} activeMissionId={activeMissionId} onSelect={selectProject} onNewProject={() => setIsProjectDialogOpen(true)} onDelete={deleteMission} deletingId={deletingMissionId} />
              <p>{activeMission ? missionConstraints.criteria || activeMission.goal || "A focused Project with automatically organized Collections." : "Everything you clip, organized into reusable Collections."}</p>
              <div className="mobile-library-actions"><span className="capture-status"><Layers3 size={14} /> {missionRecords.length}{dataMeta.records.hasMore ? "+" : ""} Items</span><button type="button" className="secondary-button" onClick={openMobileCapture}><Plus size={14} /> Add capture</button><button type="button" className="icon-button" onClick={() => setIsProjectDialogOpen(true)} aria-label="New Project"><Target size={15} /></button></div>
            </div>
            <header className="library-heading">
              <div><div className="eyebrow">organized automatically</div><WorkspaceSwitcher missions={data.missions} collections={data.collections} records={data.records} watchRules={data.watchRules} activeMissionId={activeMissionId} onSelect={selectProject} onNewProject={() => setIsProjectDialogOpen(true)} onDelete={deleteMission} deletingId={deletingMissionId} /><p>{activeMission ? missionConstraints.criteria || activeMission.goal || "A focused Project with automatically organized Collections." : "Everything you clip, organized into reusable Collections."}</p></div>
              <div className="heading-actions"><span className="capture-status"><Layers3 size={15} /> {missionRecords.length}{dataMeta.records.hasMore ? "+" : ""} Items</span><button type="button" className="secondary-button" onClick={openMobileCapture}><Plus size={14} /> Add capture</button><button type="button" className="secondary-button" onClick={() => setIsProjectDialogOpen(true)}><Target size={14} /> New Project</button></div>
            </header>
            <div className="contextual-strips">
              {onboardingStage === OnboardingStage.FIRST_CAPTURE_RECEIVED && activeCollectionRecords.length > 0 && !dismissedGuides.routing && <div className="context-strip"><ArrowRightLeft size={15} /><span><b>Your first capture filed itself.</b> Magpie used its type and fields to choose this Collection.</span><button type="button" onClick={() => setDismissedGuides((current) => ({ ...current, routing: true }))}><X size={14} /></button></div>}
              {hasUnwatchedComparableItems && !dismissedGuides.watch && <div className="context-strip"><Radio size={15} /><span><b>These Items share fields.</b> Create a watch to hear when one changes.</span><button type="button" className="text-button" onClick={() => openWatchDialog(activeCollectionRecords.find((record) => !data.watchRules.some((watch) => watch.record_id === record.id)))}>Create watch</button><button type="button" onClick={() => setDismissedGuides((current) => ({ ...current, watch: true }))}><X size={14} /></button></div>}
              {activeCollectionRecords.length >= 3 && !dismissedGuides.ask && <div className="context-strip"><MessageCircle size={15} /><span><b>Ask Magpie can compare this Collection.</b> Answers stay grounded in these Items and their fields.</span><button type="button" className="text-button" onClick={() => setIsAgentOpen(true)}>Ask</button><button type="button" onClick={() => setDismissedGuides((current) => ({ ...current, ask: true }))}><X size={14} /></button></div>}
            </div>
            <RecordTable collection={activeCollection} collections={data.collections} records={activeRecords} totalCount={activeCollectionRecords.length} clips={data.clips} enrichments={data.enrichments} watchRules={data.watchRules} displayMode={collectionDisplayModes[activeCollection?.id] ?? activeCollectionDefaultDisplayMode} page={recordPage} hasMore={activeCollectionHasMorePages} onPageChange={changeRecordPage} onSelect={selectRecord} onSelectCollection={selectCollectionAnywhere} onDeleteCollection={deleteCollection} isDeletingCollection={deletingCollectionId === activeCollection?.id} collectionDeleteSummary={collectionDeleteSummary} onOpenOnboardingTour={() => { navigateWorkspace("nest"); setIsCaptureGuideOpen(true); }} refreshingRecordId={isRefreshing ? selectedRecord?.id : null} onDisplayModeChange={(mode) => activeCollection && setCollectionDisplayModes((current) => ({ ...current, [activeCollection.id]: mode }))} onAsk={() => setIsAgentOpen(true)} />
          </section>
        )}
        {activeView === "signals" && <SignalsSurface records={data.records} enrichments={data.enrichments} watchRules={data.watchRules} refreshAttempts={data.refreshAttempts} onSelectRecord={selectRecord} onToggleWatch={toggleSelectedWatch} togglingWatchId={togglingWatchId} onCreateWatch={openWatchDialog} />}
        {activeView === "search" && <SearchSurface records={data.records} clips={data.clips} collections={data.collections} missions={data.missions} onSelectRecord={selectRecord} onSelectCollection={selectCollectionAnywhere} onAddCapture={openMobileCapture} onCreateProject={() => setIsProjectDialogOpen(true)} onCreateWatch={openWatchDialog} onAsk={() => setIsAgentOpen(true)} onSaveSearch={saveWorkspaceSearch} onExit={() => navigateWorkspace("library")} focusVersion={searchFocusVersion} />}
        <footer className="workspace-footer"><span><span className="status-dot" /> Realtime owner data</span><span>Magpie never grants the extension read access.</span><div className="footer-links"><a className="footer-link" href="https://www.linkedin.com/company/magpie-or-else" target="_blank" rel="noreferrer"><Linkedin size={12} /> LinkedIn</a><button type="button" className="footer-link footer-link-button" onClick={() => setIsBugReportOpen(true)}><Bug size={12} /> Found a bug?</button></div></footer>
      </section>
      <nav className="mobile-bottom-nav" aria-label="Workspace">{[["nest", "Nest", Inbox], ["library", "Collections", Layers3], ["signals", "Signals", Radio]].map(([id, label, Icon]) => <button type="button" key={id} className={activeView === id ? "active" : ""} onClick={() => navigateWorkspace(id)}><Icon size={18} /><span>{label}</span></button>)}<button type="button" onClick={() => setIsAgentOpen(true)}><MessageCircle size={18} /><span>Ask</span></button></nav>
      {routingUndo && <div className="routing-undo-toast" role="status"><Check size={15} /><span><b>{routingUndo.title}</b> filed in {routingUndo.collectionName}.</span><button type="button" onClick={undoRoutingResolution}>Undo</button></div>}
      {isActivityOpen && <ActivityPanel enrichments={data.enrichments} records={data.records} onSelect={selectRecord} onClose={() => setIsActivityOpen(false)} />}
      <RecordDetail record={selectedRecord} clip={selectedClip} enrichments={selectedEnrichments} watch={selectedWatch} onClose={() => { setSelectedRecord(null); setRefreshNotice(null); }} onRefresh={refreshSelectedRecord} isRefreshing={isRefreshing} onStatus={updateCandidateStatus} refreshNotice={refreshNotice} onDelete={deleteSelectedRecord} isDeleting={isDeletingRecord} onToggleWatch={toggleSelectedWatch} onCreateWatch={openWatchDialog} isTogglingWatch={isTogglingWatch} onCorrectField={correctSelectedRecordField} />
      {isMobileCaptureOpen && <MobileCaptureDialog onClose={() => setIsMobileCaptureOpen(false)} onSubmit={submitMobileCapture} isSubmitting={isMobileCapturing} error={mobileCaptureError} result={mobileCaptureResult} missions={data.missions} activeMissionId={activeMissionId} />}
      {isCaptureGuideOpen && <CaptureGuideDialog onClose={() => setIsCaptureGuideOpen(false)} onPair={handleCreatePairing} onPaste={openMobileCapture} onIos={openIosShortcutSetup} isPairing={isPairing} hasPairedExtension={hasPairedExtension} />}
      {pairing && <PairingDialog pairing={pairing} onClose={() => setPairing(null)} />}
      {isPairingManagementOpen && <PairingManagementDialog pairings={data.extensionInstalls} onClose={() => setIsPairingManagementOpen(false)} onPair={createPairingFromManagement} isPairing={isPairing} onRevoke={revokeExtensionPairing} onRevokeAll={revokeAllExtensionPairings} revokingId={revokingInstallationId} isRevokingAll={isRevokingAllPairings} error={pairingManagementError} />}
      {watchDialog && <WatchDialog records={data.records} watchRules={data.watchRules} initialRecordId={watchDialog.recordId} initialField={watchDialog.field} onClose={() => setWatchDialog(null)} onSave={saveManualWatch} isSaving={isSavingWatch} error={watchDialogError} />}
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
