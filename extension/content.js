const PICKER_ID = "magpie-capture-picker";
const TOAST_ID = "magpie-capture-toast";
const SNIP_OVERLAY_ID = "magpie-snip-overlay";
let pickerActive = false;
let hoveredElement = null;
let highlight = null;
let pickerMode = "element";
let lastContextTarget = null;
let snipActive = false;
let snipOverlay = null;
let snipRect = null;
let snipStart = null;
let captureSubmitting = false;

// Lets the dashboard detect the extension is installed before any pairing
// exists, without needing to know this extension's ID (unpacked/dev-mode
// installs get a different random ID per machine, so the usual
// externally_connectable + chrome.runtime.sendMessage(extensionId, ...)
// pattern doesn't work here). The content script is already injected into
// every page including the dashboard's own, so it can just mark the page
// directly -- gated to Magpie's own origins only (browser-enforced, not
// spoofable by page script) so no other site can read this presence signal.
if (/^https?:\/\/(magpiecapture\.com|localhost|127\.0\.0\.1)(:|\/|$)/.test(location.origin)) {
  document.documentElement.setAttribute("data-magpie-extension", "installed");
  window.dispatchEvent(new CustomEvent("magpie:extension-present"));
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "magpie:start-picker") {
    startPicker(message.mode);
    return undefined;
  }
  if (message?.type === "magpie:cancel-picker") {
    sendResponse({ cancelled: cancelCaptureMode() });
    return undefined;
  }
  if (message?.type === "magpie:capture-context") {
    try {
      sendResponse(buildContextPayload(message.mode, message.context));
    } catch (error) {
      sendResponse({ error: error.message || "Could not capture this content." });
    }
    return undefined;
  }
  if (message?.type === "magpie:collect-refresh") {
    const description = document.querySelector('meta[name="description"]')?.content;
    sendResponse({
      raw_text: boundedLines([document.title, description, document.body?.innerText]),
    });
    return undefined;
  }
  if (message?.type === "magpie:toast") {
    if (message.result) {
      const { message: text, state } = describeCaptureResult(message.result);
      showToast(text, state, message.result.dashboard_url);
    } else {
      showToast(message.message, message.state || "success");
    }
  }
  return undefined;
});

document.addEventListener("contextmenu", (event) => {
  lastContextTarget = event.target instanceof Element ? event.target : null;
}, true);

document.addEventListener("keydown", (event) => {
  // Capture Escape before the host page can stop propagation. The picker is
  // an extension-owned modal interaction, so cancelling it must not also
  // trigger the page's own Escape behavior (closing a dialog, exiting a
  // player, and so on).
  if (event.key === "Escape" && (pickerActive || snipActive)) {
    event.preventDefault();
    event.stopImmediatePropagation();
    cancelCaptureMode();
    return;
  }
  // event.code identifies the physical key, so shortcuts work on any keyboard
  // layout (event.key becomes "ב" on a Hebrew layout for the same key).
  if (event.altKey && event.shiftKey && (event.code === "KeyM" || event.key.toLowerCase() === "m")) {
    event.preventDefault();
    startPicker();
  }
  if (pickerActive && (event.code === "KeyC" || event.key.toLowerCase() === "c") && !isEditable(event.target)) {
    event.preventDefault();
    if (hoveredElement) captureElement(hoveredElement);
  }
}, true);

function cancelCaptureMode() {
  const wasActive = pickerActive || snipActive;
  if (pickerActive) stopPicker();
  if (snipActive) stopSnip();
  if (wasActive) notifyCaptureModeEnded("cancelled");
  return wasActive;
}

function notifyCaptureModeEnded(reason) {
  try {
    const pending = chrome.runtime.sendMessage({ type: "magpie:capture-mode-ended", reason });
    pending?.catch?.(() => {});
  } catch {
    // The page cleanup is authoritative; a closed Side Panel needs no notice.
  }
}

function startPicker(mode = "element") {
  if (mode === "visual") {
    startSnip();
    return;
  }
  if (pickerActive) return;
  if (captureSubmitting) {
    showToast("A capture is still running — wait for it to finish.", "hint");
    return;
  }
  if (snipActive) stopSnip();
  pickerMode = "element";
  pickerActive = true;
  document.documentElement.classList.add("magpie-picker-active");
  highlight = document.createElement("div");
  highlight.id = PICKER_ID;
  document.body.append(highlight);
  document.addEventListener("pointermove", updateHighlight, true);
  document.addEventListener("click", selectElement, true);
  showToast("Hover any element, then press C to clip it. Esc cancels.", "hint");
}

function startSnip() {
  if (snipActive) return;
  if (captureSubmitting) {
    showToast("A capture is still running — wait for it to finish.", "hint");
    return;
  }
  if (pickerActive) stopPicker();
  snipActive = true;
  snipOverlay = document.createElement("div");
  snipOverlay.id = SNIP_OVERLAY_ID;
  snipRect = document.createElement("div");
  snipRect.className = "magpie-snip-rect";
  snipOverlay.append(snipRect);
  document.body.append(snipOverlay);
  snipOverlay.addEventListener("pointerdown", onSnipDown);
  showToast("Drag to select the area to clip. Esc cancels.", "hint");
}

function stopSnip() {
  snipActive = false;
  snipStart = null;
  snipOverlay?.remove();
  snipOverlay = null;
  snipRect = null;
  hideToast();
}

function onSnipDown(event) {
  event.preventDefault();
  snipStart = { x: event.clientX, y: event.clientY };
  snipOverlay.setPointerCapture(event.pointerId);
  snipOverlay.addEventListener("pointermove", onSnipMove);
  snipOverlay.addEventListener("pointerup", onSnipUp, { once: true });
  drawSnipRect(event);
}

function onSnipMove(event) {
  if (snipStart) drawSnipRect(event);
}

function drawSnipRect(event) {
  const left = Math.min(snipStart.x, event.clientX);
  const top = Math.min(snipStart.y, event.clientY);
  const width = Math.abs(event.clientX - snipStart.x);
  const height = Math.abs(event.clientY - snipStart.y);
  Object.assign(snipRect.style, {
    display: "block",
    left: `${left}px`,
    top: `${top}px`,
    width: `${width}px`,
    height: `${height}px`,
  });
}

function onSnipUp(event) {
  const start = snipStart;
  stopSnip();
  notifyCaptureModeEnded("finished");
  if (!start) return;
  const rect = {
    left: Math.min(start.x, event.clientX),
    top: Math.min(start.y, event.clientY),
    right: Math.max(start.x, event.clientX),
    bottom: Math.max(start.y, event.clientY),
  };
  if (rect.right - rect.left < 8 || rect.bottom - rect.top < 8) {
    showToast("Drag a larger area to clip it.", "error");
    return;
  }
  // Let the page repaint without the overlay before the worker screenshots it.
  requestAnimationFrame(() => {
    requestAnimationFrame(() => window.setTimeout(() => submitSnip(rect), 80));
  });
}

function submitSnip(rect) {
  const payload = {
    source_url: window.location.href,
    capture_mode: "visual",
    raw_html: "",
    raw_text: snipEvidence(rect) || "Visual capture",
    captured_at: new Date().toISOString(),
    idempotency_key: crypto.randomUUID(),
    capture_intent: "compare",
    capture_rect: rectPayload(new DOMRect(rect.left, rect.top, rect.right - rect.left, rect.bottom - rect.top)),
  };
  submitCapturePayload(payload);
}

function snipEvidence(rect) {
  const seen = new Set();
  const lines = ["Visual capture"];
  for (const fx of [0.2, 0.5, 0.8]) {
    for (const fy of [0.2, 0.5, 0.8]) {
      const element = document.elementFromPoint(
        rect.left + (rect.right - rect.left) * fx,
        rect.top + (rect.bottom - rect.top) * fy,
      );
      if (!(element instanceof Element) || seen.has(element)) continue;
      seen.add(element);
      const text = (element.innerText || element.textContent || "").trim();
      if (text) lines.push(text.slice(0, 4_000));
    }
  }
  return boundedLines(lines);
}

function stopPicker() {
  pickerActive = false;
  hoveredElement = null;
  document.documentElement.classList.remove("magpie-picker-active");
  highlight?.remove();
  highlight = null;
  document.removeEventListener("pointermove", updateHighlight, true);
  document.removeEventListener("click", selectElement, true);
  hideToast();
}

function updateHighlight(event) {
  const target = event.target;
  if (!(target instanceof Element) || target.id === PICKER_ID || target.id === TOAST_ID) return;
  hoveredElement = target;
  const rect = target.getBoundingClientRect();
  Object.assign(highlight.style, {
    top: `${rect.top + window.scrollY}px`,
    left: `${rect.left + window.scrollX}px`,
    width: `${rect.width}px`,
    height: `${rect.height}px`,
  });
}

function selectElement(event) {
  event.preventDefault();
  event.stopPropagation();
  if (hoveredElement) captureElement(hoveredElement);
}

async function captureElement(element) {
  const rect = element.getBoundingClientRect();
  const payload = {
    source_url: resolveDetailUrl(element),
    capture_mode: pickerMode,
    raw_html: pickerMode === "element" ? element.outerHTML.slice(0, 12_000) : "",
    raw_text: evidenceText(element, pickerMode === "visual" ? "Visual capture" : "Selected element"),
    captured_at: new Date().toISOString(),
    idempotency_key: crypto.randomUUID(),
    capture_intent: "compare",
    capture_rect: rectPayload(rect),
  };
  stopPicker();
  notifyCaptureModeEnded("finished");

  if (!payload.raw_text) {
    showToast("Choose an element with visible text.", "error");
    return;
  }
  // Let the page repaint without the highlight overlay before the worker
  // screenshots it — without this, chrome.tabs.captureVisibleTab can still
  // grab a frame with the green hover highlight baked in (Bug B2), the same
  // race the visual snip flow already guards against in onSnipUp.
  await new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => window.setTimeout(resolve, 80)));
  });
  submitCapturePayload(payload);
}

function submitCapturePayload(payload) {
  captureSubmitting = true;
  showToast("Capturing…", "loading");
  chrome.runtime.sendMessage({ type: "magpie:capture", payload }, (response) => {
    captureSubmitting = false;
    if (chrome.runtime.lastError) {
      showToast(chrome.runtime.lastError.message, "error");
      return;
    }
    if (!response?.ok) {
      showToast(response?.error || "Capture failed.", "error");
      return;
    }
    const { message, state } = describeCaptureResult(response.result);
    showToast(message, state, response.result?.dashboard_url);
  });
}

function buildContextPayload(mode, context = {}) {
  const base = {
    capture_mode: mode,
    raw_html: "",
    captured_at: new Date().toISOString(),
    idempotency_key: crypto.randomUUID(),
    capture_intent: "compare",
  };

  if (mode === "selection") {
    const selected = String(context.selectionText || window.getSelection()?.toString() || "").trim();
    if (!selected) throw new Error("Select some text before saving it.");
    const surrounding = evidenceText(lastContextTarget, "Selection context");
    return {
      ...base,
      source_url: window.location.href,
      raw_text: boundedLines([selected, surrounding]),
    };
  }

  if (mode === "link") {
    const anchor = lastContextTarget?.closest?.("a[href]");
    const targetUrl = safeHttpUrl(context.linkUrl || anchor?.href);
    if (!targetUrl) throw new Error("This link cannot be captured.");
    return {
      ...base,
      source_url: targetUrl,
      context_url: window.location.href,
      raw_text: boundedLines([
        anchor?.innerText || anchor?.getAttribute("aria-label") || targetUrl,
        evidenceText(anchor?.parentElement || lastContextTarget, "Link context"),
      ]),
    };
  }

  if (mode === "image") {
    const image = lastContextTarget?.closest?.("img");
    if (!image) throw new Error("Right-click a visible image to capture it.");
    return {
      ...base,
      source_url: window.location.href,
      raw_text: boundedLines([
        image.alt,
        image.getAttribute("aria-label"),
        image.closest("figure")?.querySelector("figcaption")?.innerText,
        evidenceText(image.parentElement, "Image context"),
      ]) || `Image captured from ${document.title || location.hostname}`,
      capture_rect: rectPayload(image.getBoundingClientRect()),
    };
  }

  if (mode === "page") {
    const description = document.querySelector('meta[name="description"]')?.content;
    return {
      ...base,
      source_url: window.location.href,
      raw_text: boundedLines([
        document.title,
        description,
        document.body?.innerText,
      ]),
    };
  }

  throw new Error("Unsupported capture mode.");
}

function evidenceText(element, label) {
  if (!(element instanceof Element)) return "";
  const text = element.innerText || element.textContent || "";
  const accessible = [
    element.getAttribute("aria-label"),
    element.getAttribute("alt"),
    element.getAttribute("title"),
  ].filter(Boolean).join(" ");
  return boundedLines([label, accessible, text]);
}

function boundedLines(values) {
  return values
    .filter((value) => typeof value === "string" && value.trim())
    .map((value) => value.trim().slice(0, 20_000))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .slice(0, 20_000);
}

function rectPayload(rect) {
  const left = Math.max(rect.left, 0);
  const top = Math.max(rect.top, 0);
  const right = Math.min(rect.right, window.innerWidth);
  const bottom = Math.min(rect.bottom, window.innerHeight);
  return {
    x: left,
    y: top,
    width: Math.max(right - left, 1),
    height: Math.max(bottom - top, 1),
    viewport_width: window.innerWidth,
    viewport_height: window.innerHeight,
  };
}

function safeHttpUrl(value) {
  try {
    const url = new URL(value, window.location.href);
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : "";
  } catch {
    return "";
  }
}

// List-style pages (e.g. rental listings) often put the clicked card's own
// detail link on an ancestor or nested <a>. Falling back to location.href
// unconditionally saved the *list* page, which can reshuffle/refresh and
// lose the specific item the user meant to capture (Bug B4).
function resolveDetailUrl(element) {
  if (!(element instanceof Element)) return window.location.href;
  const anchor = element.closest("a[href]") || element.querySelector("a[href]");
  // anchor?.href would pass `undefined` to safeHttpUrl when no anchor is
  // found; new URL(undefined, base) coerces that to the literal string
  // "undefined" instead of throwing, producing a bogus "<origin>/undefined"
  // URL instead of falling back to location.href. Guard on anchor first.
  if (!anchor) return window.location.href;
  return safeHttpUrl(anchor.href) || window.location.href;
}

function describeCaptureResult(result) {
  if (!result) return { message: "Captured — organizing in Magpie.", state: "success" };
  if (result.capture_status === "duplicate") {
    return result.routing_status === "needs_review"
      ? { message: "You saved this before — it's still waiting for review.", state: "review" }
      : { message: "Already in Magpie — you saved this before.", state: "success" };
  }
  if (result.routing_status === "needs_review") {
    return { message: reviewMessage(result.routing_reason_code), state: "review" };
  }
  if (result.routing_status === "created_collection") {
    return { message: "Saved — Magpie created a new Collection for this.", state: "success" };
  }
  if (result.routing_status === "routed_existing") {
    return { message: "Saved to an existing Collection.", state: "success" };
  }
  if (result.routing_status === "failed") {
    return { message: "Captured, but organizing failed. Retry from the dashboard.", state: "error" };
  }
  return { message: "Captured — organizing in Magpie.", state: "success" };
}

function reviewMessage(reasonCode) {
  const messages = {
    ai_unavailable: "Captured — organization is temporarily unavailable.",
    malformed_ai_response: "Captured — Magpie needs help understanding this page.",
    ambiguous_candidates: "Captured — Magpie found more than one possible type.",
    mixed_content: "Captured — select a more specific part of the page.",
    invalid_schema: "Captured — the proposed fields need a quick review.",
    unsafe_collection_name: "Captured — Magpie could not create a safe Collection name.",
    unsupported_schema: "Captured — Magpie could not create a safe Collection shape.",
    insufficient_supported_fields: "Captured — select an element with at least two useful details.",
    low_confidence: "Captured — Magpie is not confident enough to organize this automatically.",
    inactive_collection: "Captured — the matching Collection is archived.",
  };
  return messages[reasonCode] || "Captured — this Item needs a quick organization review.";
}

let toastTimer = null;
let toastStageTimers = [];

// A real capture (screenshot upload, then AI routing) can genuinely run past
// 10 seconds under load. A spinner alone reads as stuck past a few seconds —
// staged text that names plausible real work keeps it reading as "working."
const LOADING_STAGES = [
  { delay: 3500, message: "Uploading the screenshot…" },
  { delay: 8000, message: "Understanding what this is…" },
  { delay: 14000, message: "Almost there — organizing this for you…" },
];

function showToast(message, state, url) {
  let toast = document.getElementById(TOAST_ID);
  if (!toast) {
    toast = document.createElement("div");
    toast.id = TOAST_ID;
    document.body.append(toast);
  }
  window.clearTimeout(toastTimer);
  toastStageTimers.forEach((id) => window.clearTimeout(id));
  toastStageTimers = [];
  toast.dataset.state = state;
  toast.replaceChildren();

  const row = document.createElement("div");
  row.className = "magpie-toast-row";
  if (state === "loading") {
    const spinner = document.createElement("span");
    spinner.className = "magpie-toast-spinner";
    row.append(spinner);
  }
  const text = document.createElement("span");
  text.textContent = message;
  row.append(text);
  toast.append(row);

  if (state === "loading") {
    for (const stage of LOADING_STAGES) {
      toastStageTimers.push(window.setTimeout(() => { text.textContent = stage.message; }, stage.delay));
    }
  }

  if (url) {
    const link = document.createElement("a");
    link.href = url;
    link.target = "_blank";
    link.rel = "noreferrer";
    link.textContent = state === "review" ? "Review in Magpie →" : "Open Magpie →";
    toast.append(link);
  }

  // Loading persists until the result updates it; the long timeout is only a
  // safety net for a worker that never responds.
  const lifetime = state === "loading" ? 25_000 : url ? 9000 : state === "hint" ? 8000 : 4200;
  toastTimer = window.setTimeout(() => toast.remove(), lifetime);
}

function hideToast() {
  window.clearTimeout(toastTimer);
  toastStageTimers.forEach((id) => window.clearTimeout(id));
  toastStageTimers = [];
  document.getElementById(TOAST_ID)?.remove();
}

function isEditable(target) {
  return target instanceof HTMLElement && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName));
}
