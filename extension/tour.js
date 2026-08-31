import { driver } from "./vendor/driver.js";
import { buildExtensionTourSteps } from "./tour-steps.js";

// A real docked Side Panel gets created by Chrome's own panel-sizing IPC,
// which can report a zero or not-yet-final width/height for a brief moment
// after the panel first opens -- a plain tab navigated straight to this
// same HTML never goes through that lifecycle at all, so it can't reproduce
// this. If driver.js computes the popover's position against a
// zero-or-near-zero viewport, it falls back to a corner-pinned placement
// (confirmed in its own positioning logic) -- exactly the "stuck bottom-left
// until a manual resize" symptom, since a real resize is the first
// legitimate size signal driver.js's own resize listener reacts to.
// Waiting for a confirmed non-zero size before ever calling drive() the
// first time closes that window instead of reacting to it after the fact.
function waitForStableSize(timeoutMs = 600) {
  return new Promise((resolve) => {
    if (typeof ResizeObserver === "undefined") {
      resolve();
      return;
    }
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      observer.disconnect();
      resolve();
    };
    const observer = new ResizeObserver((entries) => {
      const box = entries[0]?.contentRect;
      if (box && box.width > 0 && box.height > 0) finish();
    });
    observer.observe(document.documentElement);
    setTimeout(finish, timeoutMs);
  });
}

// Mirrors src/tour/TourOverlay.jsx's design (real steps/drive()/moveTo()
// API, not the standalone highlight() method, which silently forces
// showButtons to an empty array regardless of config) but as plain JS --
// there's no React re-render churn to guard against here, so a lazily
// created singleton instance is enough.
export function initExtensionTour() {
  let instance = null;
  const readyForFirstDrive = waitForStableSize();
  // Tracks which variant of the last step is currently configured, so
  // setSteps() (which resets driver.js's internal state) only runs when the
  // real outcome actually changed, not on every unrelated storage write.
  let configuredRoutingStatus;

  function toDriverSteps(routingStatus) {
    return buildExtensionTourSteps(routingStatus).map((step) => ({
      element: step.selector,
      popover: { title: step.title, description: step.description },
    }));
  }

  function buildInstance(routingStatus) {
    configuredRoutingStatus = routingStatus;
    return driver({
      animate: true,
      allowClose: true,
      overlayClickBehavior: "close",
      overlayColor: "#16261b",
      overlayOpacity: 0.55,
      showButtons: ["next", "previous", "close"],
      stagePadding: 6,
      stageRadius: 8,
      popoverClass: "magpie-tour-popover",
      steps: toDriverSteps(routingStatus),
      onCloseClick: () => dismiss(),
      onDoneClick: () => dismiss(),
      onPopoverRender: (popoverDom) => {
        const skip = document.createElement("button");
        skip.type = "button";
        skip.className = "tour-skip-link";
        skip.textContent = "Skip tour";
        skip.onclick = () => dismiss();
        popoverDom.footer.insertBefore(skip, popoverDom.footer.firstChild);
      },
    });
  }

  // Applied before drive()/moveTo() land on the last step, so its content
  // is already correct (created_collection/routed_existing -> "filed
  // itself"; needs_review -> "waiting in Nest") by the time it's shown.
  //
  // Rebuilds the whole instance rather than calling driver.js's own
  // setSteps() -- confirmed directly that setSteps's internal resetState()
  // wipes its reference to the currently-shown popover *before* removing
  // it from the page, orphaning a stale, now-unreachable popover element
  // behind the new one instead of replacing it. destroy() runs the real
  // teardown first, so the old popover is actually removed.
  function ensureSteps(routingStatus) {
    if (instance && routingStatus === configuredRoutingStatus) return;
    instance?.destroy();
    instance = buildInstance(routingStatus);
  }

  function dismiss() {
    instance?.destroy();
    chrome.storage.local.set({ tourDismissed: true });
  }

  // The popover's position is computed once, against whatever the layout
  // happens to be at that instant. sidepanel.css loads its custom fonts
  // with font-display: swap, so the panel can still reflow (button widths
  // shifting as the fallback font swaps for the real one) shortly after
  // drive()/moveTo() runs -- driver.js has no way to know that happened
  // unless something calls .refresh() or its own window "resize" listener
  // fires, which is exactly why manually resizing the panel "fixed" it.
  function scheduleRefresh() {
    requestAnimationFrame(() => requestAnimationFrame(() => instance?.refresh()));
    document.fonts?.ready?.then(() => instance?.refresh());
  }

  async function refresh() {
    await readyForFirstDrive;
    const { extensionToken, lastCaptureOutcome, tourDismissed } = await chrome.storage.local.get({
      extensionToken: "",
      lastCaptureOutcome: null,
      tourDismissed: false,
    });
    if (tourDismissed || !extensionToken) {
      instance?.destroy();
      return;
    }
    ensureSteps(lastCaptureOutcome?.routingStatus ?? null);
    const floorIndex = lastCaptureOutcome ? 1 : 0;
    if (!instance.isActive()) {
      instance.drive(floorIndex);
      scheduleRefresh();
      return;
    }
    const activeIndex = instance.getActiveIndex() ?? 0;
    if (floorIndex > activeIndex) {
      instance.moveTo(floorIndex);
      scheduleRefresh();
    }
  }

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    if (changes.extensionToken || changes.lastCaptureOutcome) refresh();
  });

  refresh();

  return {
    replay: async () => {
      await chrome.storage.local.set({ tourDismissed: false });
      if (!instance) instance = buildInstance(null);
      instance.drive(0);
      scheduleRefresh();
    },
  };
}
