import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowRightLeft,
  ArrowUp,
  Book,
  Bug,
  Check,
  Inbox,
  Layers3,
  Linkedin,
  LoaderCircle,
  LockKeyhole,
  LogOut,
  MessageCircle,
  Radio,
  Search,
  Target,
  Plus,
  Sparkles,
  Trash2,
  UserRound,
  X,
} from "lucide-react";
import { base44 } from "@/api/base44Client";
import { PairingIcon } from "./components/icons.jsx";
import Landing from "./Landing.jsx";
import LoginPage from "./LoginPage.jsx";
import Docs from "./Docs.jsx";
import { isDocsRoute, parseDocsLocation } from "./docs-navigation.js";
import CaptureGuideDialog from "./onboarding/CaptureGuideDialog.jsx";
import { OnboardingStage, deriveOnboardingStage } from "./onboarding/state.js";
import { fetchAllPages } from "./dashboard-pagination.js";
import {
  hasActivePairing,
  needsPairingReconnect,
} from "./pairing-lifecycle.js";
import { searchWorkspace } from "./workspace-search.js";
import { parseJson } from "./lib/parsing.js";
import { clipTitle, collectionHasCapturedImages } from "./lib/text.js";
import { workspaceViewFromPath, readShareDraft } from "./lib/routing.js";
import { collectionDotStatus, listDashboardPage, DASHBOARD_LIST_LIMIT, RECORDS_PAGE_SIZE, emptyData, emptyDataMeta } from "./lib/dashboardData.js";
import MagpieMark from "./components/MagpieMark.jsx";
import PairingDialog from "./features/pairing/PairingDialog.jsx";
import PairingReconnectNotice from "./features/pairing/PairingReconnectNotice.jsx";
import PairingManagementDialog from "./features/pairing/PairingManagementDialog.jsx";
import WorkspaceSwitcher from "./features/library/WorkspaceSwitcher.jsx";
import WatchDialog from "./features/watches/WatchDialog.jsx";
import RecordTable from "./features/library/RecordTable.jsx";
import ActivityPanel from "./features/records/ActivityPanel.jsx";
import RecordDetail from "./features/records/RecordDetail.jsx";
import NestSurface from "./features/nest/NestSurface.jsx";
import NeedsReviewPanel from "./features/nest/NeedsReviewPanel.jsx";
import SignalsSurface from "./features/signals/SignalsSurface.jsx";
import SearchSurface from "./features/search/SearchSurface.jsx";
import MagpieAgentPanel from "./features/agent/MagpieAgentPanel.jsx";
import ShareCapturePage from "./ShareCapturePage.jsx";
import AppNavigation from "./layout/AppNavigation.jsx";
import ProjectDialog from "./features/projects/ProjectDialog.jsx";
import BugReportDialog from "./features/support/BugReportDialog.jsx";
import MobileCaptureDialog from "./features/capture/MobileCaptureDialog.jsx";

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
        onAsk={() => setIsAgentOpen(true)}
        isAskOpen={isAgentOpen}
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
