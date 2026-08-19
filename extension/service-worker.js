import {
  nextRefreshAt,
  normalizeRefreshEntry,
  PROACTIVE_MAX_REMEMBERED_URLS,
  PROACTIVE_REFRESH_ALARM,
  PROACTIVE_REFRESH_PERIOD_MINUTES,
  removeSavedUrl,
  selectDueRefresh,
} from "./refresh-scheduler.js";

const DEFAULT_CONFIG = {
  ingestUrl: "",
  extensionToken: "",
  activeMissionId: "",
  captureIntent: "compare",
  proactiveRefreshEnabled: false,
};
const REFRESH_MIN_INTERVAL_MS = 12 * 60 * 60 * 1_000;
const MAX_REMEMBERED_URLS = 500;

// Every capture path (picker/snip in content.js, Side Panel buttons, the right-click
// menu) funnels through here before hitting the network. One in-flight capture
// at a time keeps a double-click or a stacked right-click from firing two
// overlapping ingest requests and tripping the backend rate limit.
let captureInFlight = false;
let proactiveRefreshInFlight = false;

ensureProactiveAlarm();
chrome.runtime.onStartup.addListener(() => ensureProactiveAlarm());
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name !== PROACTIVE_REFRESH_ALARM) return;
  runProactiveRefresh().catch((error) => console.warn("Magpie proactive refresh skipped", error));
});

async function withCaptureLock(run) {
  if (captureInFlight) {
    throw new Error("A capture is already in progress — wait a moment and try again.");
  }
  captureInFlight = true;
  try {
    return await run();
  } finally {
    captureInFlight = false;
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "magpie:capture-status") {
    sendResponse({ inFlight: captureInFlight });
    return undefined;
  }
  if (message?.type === "magpie:capture") {
    withCaptureLock(() => addViewportScreenshot(message.payload, sender).then((payload) => submitCapture(payload)))
      .then((result) => sendResponse({ ok: true, result }))
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }
  if (message?.type === "magpie:capture-tab") {
    withCaptureLock(() => captureFromTab(message.tabId, message.mode))
      .then((result) => sendResponse({ ok: true, result }))
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }
  return undefined;
});

chrome.runtime.onInstalled.addListener(() => {
  // Chrome persists this setting across service-worker restarts, so it only
  // needs to run once per install/update, same as the two calls below. If it
  // rejects (older Chrome build), the toolbar action just falls back to
  // doing nothing on click instead of breaking the rest of startup.
  chrome.sidePanel
    ?.setPanelBehavior({ openPanelOnActionClick: true })
    .catch((error) => console.warn("Magpie could not enable Side Panel on action click", error));
  installContextMenus();
  reinjectContentScripts();
  ensureProactiveAlarm();
});

function ensureProactiveAlarm() {
  chrome.alarms.create(PROACTIVE_REFRESH_ALARM, { periodInMinutes: PROACTIVE_REFRESH_PERIOD_MINUTES })
    .catch((error) => console.warn("Magpie could not schedule proactive refresh", error));
}

// Tabs opened before an extension update keep their old content script; give
// every open http(s) tab the current one. Re-running the file in a tab whose
// script is already current throws on const redeclaration, which the catch
// swallows, so listeners are never duplicated.
async function reinjectContentScripts() {
  const tabs = await chrome.tabs.query({ url: ["http://*/*", "https://*/*"] });
  for (const tab of tabs) {
    if (!tab.id) continue;
    try {
      await chrome.scripting.insertCSS({ target: { tabId: tab.id }, files: ["content.css"] });
      await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["content.js"] });
    } catch {
      // Restricted pages and already-current tabs are fine to skip.
    }
  }
}

chrome.contextMenus.onClicked.addListener((info, tab) => {
  const modes = {
    "magpie-selection": "selection",
    "magpie-link": "link",
    "magpie-image": "image",
    "magpie-page": "page",
  };
  const mode = modes[info.menuItemId];
  if (!mode || !tab?.id) return;
  withCaptureLock(() => captureFromTab(tab.id, mode, {
    selectionText: info.selectionText,
    linkUrl: info.linkUrl,
    srcUrl: info.srcUrl,
    pageUrl: info.pageUrl,
  })).catch((error) => notifyTab(tab.id, { message: error.message || "Capture failed.", state: "error" }));
});

chrome.commands.onCommand.addListener(async (command) => {
  if (command !== "start-picker") return;

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) return;
    await startPickerInTab(tab.id, "element");
  } catch (error) {
    console.warn("Magpie cannot start on this page", error);
  }
});

async function addViewportScreenshot(payload, sender) {
  const { capture_rect: captureRect, ...boundedPayload } = payload;
  if (!sender.tab?.windowId || !needsScreenshot(payload.capture_mode)) return boundedPayload;
  try {
    let screenshotDataUrl = await chrome.tabs.captureVisibleTab(sender.tab.windowId, {
      format: "jpeg",
      quality: 58,
    });
    // Every screenshot-needing mode now sends its bounding rect, so crop
    // whenever we have one instead of special-casing which modes qualify —
    // element mode used to be silently excluded here and captured the whole
    // viewport instead of the clicked element.
    if (captureRect) {
      screenshotDataUrl = await cropScreenshot(screenshotDataUrl, captureRect);
    }
    return { ...boundedPayload, screenshot_data_url: screenshotDataUrl };
  } catch (error) {
    console.warn("Magpie could not capture a screenshot", error);
    return boundedPayload;
  }
}

async function submitCapture(payload) {
  const { ingestUrl, extensionToken, activeMissionId, captureIntent } = await chrome.storage.local.get(DEFAULT_CONFIG);
  if (!ingestUrl || !extensionToken) {
    throw new Error("Open the Magpie extension and add your paired token first.");
  }

  const response = await fetch(ingestUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${extensionToken}`,
      ...appHeaders(ingestUrl),
    },
    body: JSON.stringify({
      ...payload,
      mission_id: activeMissionId || undefined,
      capture_intent: captureIntent,
    }),
  });

  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(body.error || `Capture failed with status ${response.status}`);
  }

  await rememberSavedUrl(payload.source_url);
  return { ...body, dashboard_url: buildDashboardUrl(ingestUrl, body.clip_id, body.routing_status) };
}

function refreshUrlKey(value) {
  try {
    const url = new URL(value);
    url.hash = "";
    return url.toString();
  } catch {
    return "";
  }
}

async function rememberSavedUrl(sourceUrl) {
  const key = refreshUrlKey(sourceUrl);
  if (!key) return;
  const { savedUrls } = await chrome.storage.local.get({ savedUrls: {} });
  savedUrls[key] = normalizeRefreshEntry(savedUrls[key]);
  const keys = Object.keys(savedUrls);
  if (keys.length > Math.min(MAX_REMEMBERED_URLS, PROACTIVE_MAX_REMEMBERED_URLS)) delete savedUrls[keys[0]];
  await chrome.storage.local.set({ savedUrls });
}

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status !== "complete" || !/^https?:/.test(tab?.url ?? "")) return;
  maybeAutoRefresh(tabId, tab.url).catch((error) => console.warn("Magpie auto-refresh skipped", error));
});

async function maybeAutoRefresh(tabId, url) {
  if (captureInFlight) return;
  const key = refreshUrlKey(url);
  if (!key) return;
  const { savedUrls, autoRefreshEnabled, ingestUrl, extensionToken } = await chrome.storage.local.get({
    savedUrls: {},
    autoRefreshEnabled: true,
    ingestUrl: "",
    extensionToken: "",
  });
  const entry = savedUrls[key];
  if (!autoRefreshEnabled || !entry || !ingestUrl || !extensionToken) return;
  if (Date.now() - Number(entry.lastRefreshAt || 0) < REFRESH_MIN_INTERVAL_MS) return;

  const now = Date.now();
  const normalizedEntry = normalizeRefreshEntry(entry, now);
  normalizedEntry.lastRefreshAt = now;
  normalizedEntry.lastOutcome = "running";
  normalizedEntry.nextRefreshAt = nextRefreshAt(now, 0);
  savedUrls[key] = normalizedEntry;
  await chrome.storage.local.set({ savedUrls });

  const evidence = await sendToContentScript(tabId, { type: "magpie:collect-refresh" });
  if (!evidence?.raw_text) return;

  const response = await fetch(ingestUrl.replace(/\/functions\/ingest-clip\/?$/, "/functions/refresh-capture"), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${extensionToken}`,
      ...appHeaders(ingestUrl),
    },
    body: JSON.stringify({ source_url: key, raw_text: evidence.raw_text }),
  });
  const body = await response.json().catch(() => ({}));
  if (response.ok && body.outcome === "no_match") {
    await forgetSavedUrl(key);
    return;
  }
  if (response.ok && body.outcome === "updated") {
    await notifyTab(tabId, {
      message: `Magpie caught ${body.change_count} change${body.change_count === 1 ? "" : "s"} on this saved page.`,
      state: "success",
    });
  }
}

async function runProactiveRefresh() {
  if (captureInFlight || proactiveRefreshInFlight) return;
  proactiveRefreshInFlight = true;
  let tabId = null;
  let candidateUrl = "";
  try {
    const { savedUrls, proactiveRefreshEnabled, ingestUrl, extensionToken } = await chrome.storage.local.get({
      savedUrls: {},
      proactiveRefreshEnabled: false,
      ingestUrl: "",
      extensionToken: "",
    });
    if (!proactiveRefreshEnabled || !ingestUrl || !extensionToken) return;

    const candidate = selectDueRefresh(savedUrls);
    if (!candidate) return;
    candidateUrl = candidate.url;

    const now = Date.now();
    const entry = normalizeRefreshEntry(candidate.entry, now);
    entry.lastRefreshAt = now;
    entry.lastOutcome = "running";
    savedUrls[candidate.url] = entry;
    await chrome.storage.local.set({ savedUrls });

    const tab = await chrome.tabs.create({ url: candidate.url, active: false });
    tabId = tab.id;
    if (!tabId) throw new Error("Background refresh tab could not be created.");
    await waitForTabComplete(tabId, 30_000);
    const evidence = await sendToContentScript(tabId, { type: "magpie:collect-refresh" });
    if (!evidence?.raw_text) throw new Error("The page returned no bounded refresh evidence.");

    const response = await fetch(refreshCaptureUrl(ingestUrl), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${extensionToken}`,
        ...appHeaders(ingestUrl),
      },
      body: JSON.stringify({ source_url: candidate.url, raw_text: evidence.raw_text }),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error || `Refresh failed with status ${response.status}`);
    if (body.outcome === "no_match") {
      await forgetSavedUrl(candidate.url);
      return;
    }

    await finishProactiveRefresh(candidate.url, { outcome: body.outcome || "unknown", success: true });
  } catch (error) {
    console.warn("Magpie proactive refresh failed", error);
    if (candidateUrl) await finishProactiveRefresh(candidateUrl, { outcome: "failed", success: false });
  } finally {
    if (tabId) await closeTabQuietly(tabId);
    proactiveRefreshInFlight = false;
  }
}

async function forgetSavedUrl(url) {
  const { savedUrls } = await chrome.storage.local.get({ savedUrls: {} });
  if (!Object.prototype.hasOwnProperty.call(savedUrls, url)) return;
  await chrome.storage.local.set({ savedUrls: removeSavedUrl(savedUrls, url) });
}

async function finishProactiveRefresh(url, { outcome, success }) {
  const { savedUrls } = await chrome.storage.local.get({ savedUrls: {} });
  if (!savedUrls[url]) return;
  const now = Date.now();
  const entry = normalizeRefreshEntry(savedUrls[url], now);
  entry.lastOutcome = outcome;
  entry.failureCount = success ? 0 : entry.failureCount + 1;
  if (success) entry.lastSuccessAt = now;
  entry.nextRefreshAt = nextRefreshAt(now, entry.failureCount);
  savedUrls[url] = entry;
  await chrome.storage.local.set({ savedUrls });
}

function refreshCaptureUrl(ingestUrl) {
  return ingestUrl.replace(/\/functions\/ingest-clip\/?$/, "/functions/refresh-capture");
}

function waitForTabComplete(tabId, timeoutMs) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      chrome.tabs.onUpdated.removeListener(onUpdated);
      error ? reject(error) : resolve();
    };
    const timeout = setTimeout(() => finish(new Error("Background refresh page load timed out.")), timeoutMs);
    const onUpdated = (updatedTabId, changeInfo) => {
      if (updatedTabId === tabId && changeInfo.status === "complete") finish();
    };
    chrome.tabs.onUpdated.addListener(onUpdated);
    chrome.tabs.get(tabId).then((tab) => {
      if (tab.status === "complete") finish();
    }).catch((error) => finish(error));
  });
}

async function closeTabQuietly(tabId) {
  try {
    await chrome.tabs.remove(tabId);
  } catch {
    // Chrome may already have removed the tab after a navigation failure.
  }
}

function buildDashboardUrl(ingestUrl, clipId, routingStatus) {
  const origin = getDashboardUrl(ingestUrl);
  if (!origin) return "";
  if (routingStatus === "needs_review" && clipId) {
    return `${origin}/?review=${encodeURIComponent(clipId)}`;
  }
  return origin;
}

function getDashboardUrl(value) {
  try {
    const url = new URL(value);
    return url.pathname.includes("/functions/") ? url.origin : "";
  } catch {
    return "";
  }
}

function appHeaders(value) {
  try {
    const match = new URL(value).pathname.match(/\/api\/apps\/([^/]+)\/functions\//);
    return match
      ? {
          "X-App-Id": decodeURIComponent(match[1]),
          "Base44-App-Id": decodeURIComponent(match[1]),
        }
      : {};
  } catch {
    return {};
  }
}

async function startPickerInTab(tabId, mode = "element") {
  try {
    await chrome.tabs.sendMessage(tabId, { type: "magpie:start-picker", mode });
    return;
  } catch (error) {
    if (!String(error?.message || error).includes("Receiving end does not exist")) throw error;
  }

  await chrome.scripting.insertCSS({ target: { tabId }, files: ["content.css"] });
  await chrome.scripting.executeScript({ target: { tabId }, files: ["content.js"] });
  await chrome.tabs.sendMessage(tabId, { type: "magpie:start-picker", mode });
}

async function captureFromTab(tabId, mode, context = {}) {
  const tab = await chrome.tabs.get(tabId);
  const payload = await sendToContentScript(tabId, {
    type: "magpie:capture-context",
    mode,
    context,
  });
  if (payload?.error) throw new Error(payload.error);
  await notifyTab(tabId, { message: "Capturing…", state: "loading" });
  const enriched = await addViewportScreenshot(payload, { tab });
  const result = await submitCapture(enriched);
  await notifyTab(tabId, { result });
  return result;
}

async function sendToContentScript(tabId, message) {
  try {
    return await chrome.tabs.sendMessage(tabId, message);
  } catch (error) {
    if (!String(error?.message || error).includes("Receiving end does not exist")) throw error;
  }
  await chrome.scripting.insertCSS({ target: { tabId }, files: ["content.css"] });
  await chrome.scripting.executeScript({ target: { tabId }, files: ["content.js"] });
  return chrome.tabs.sendMessage(tabId, message);
}

async function notifyTab(tabId, payload) {
  try {
    await chrome.tabs.sendMessage(tabId, { type: "magpie:toast", ...payload });
  } catch {
    // Restricted browser pages cannot host a content-script toast.
  }
}

function installContextMenus() {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({ id: "magpie-selection", title: "Save selection to Magpie", contexts: ["selection"] });
    chrome.contextMenus.create({ id: "magpie-link", title: "Save link to Magpie", contexts: ["link"] });
    chrome.contextMenus.create({ id: "magpie-image", title: "Save image to Magpie", contexts: ["image"] });
    chrome.contextMenus.create({ id: "magpie-page", title: "Save page to Magpie", contexts: ["page"] });
  });
}

function needsScreenshot(mode) {
  return mode === "element" || mode === "visual" || mode === "image";
}

async function cropScreenshot(dataUrl, rect) {
  const response = await fetch(dataUrl);
  const bitmap = await createImageBitmap(await response.blob());
  const viewportWidth = Math.max(Number(rect.viewport_width) || bitmap.width, 1);
  const viewportHeight = Math.max(Number(rect.viewport_height) || bitmap.height, 1);
  const scaleX = bitmap.width / viewportWidth;
  const scaleY = bitmap.height / viewportHeight;
  const sourceX = clamp(Math.round(Number(rect.x) * scaleX), 0, bitmap.width - 1);
  const sourceY = clamp(Math.round(Number(rect.y) * scaleY), 0, bitmap.height - 1);
  const sourceWidth = clamp(Math.round(Number(rect.width) * scaleX), 1, bitmap.width - sourceX);
  const sourceHeight = clamp(Math.round(Number(rect.height) * scaleY), 1, bitmap.height - sourceY);
  const canvas = new OffscreenCanvas(sourceWidth, sourceHeight);
  const context = canvas.getContext("2d");
  context.drawImage(
    bitmap,
    sourceX,
    sourceY,
    sourceWidth,
    sourceHeight,
    0,
    0,
    sourceWidth,
    sourceHeight,
  );
  bitmap.close();
  const blob = await canvas.convertToBlob({ type: "image/jpeg", quality: 0.72 });
  return blobToDataUrl(blob);
}

async function blobToDataUrl(blob) {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 32_768) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 32_768));
  }
  return `data:${blob.type};base64,${btoa(binary)}`;
}

function clamp(value, minimum, maximum) {
  return Math.min(Math.max(value, minimum), maximum);
}
