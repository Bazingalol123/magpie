import type { BrowserContext, Page } from "@playwright/test";
import type { PairingCredentials } from "./dashboard";

/**
 * Opens the extension's real sidepanel.html as a normal tab in the same
 * persistent context. This is the standard (and only available) way to
 * drive the Side Panel's own UI under Playwright — there is no API to click
 * the real toolbar icon and have Chrome float the actual side panel surface
 * under automation. sidepanel.html/sidepanel.js are otherwise unmodified
 * production code (issue #46 migrated this from an action-click popup;
 * unlike the old popup, this page no longer closes itself after a
 * successful capture/picker-start/dashboard-open).
 */
export async function openSidePanel(context: BrowserContext, extensionId: string): Promise<Page> {
  const sidePanel = await context.newPage();
  await sidePanel.goto(`chrome-extension://${extensionId}/sidepanel.html`);
  return sidePanel;
}

/**
 * Fills the real Side Panel connection-settings form (#ingest-url,
 * #extension-token) with the values pairExtensionViaDialog() read out of
 * the dashboard, then clicks the real "save-settings" button — the same UI
 * path a person copy-pasting the pairing dialog's two values would use.
 * sidepanel.js's own updateConnectionState() flips
 * document.body.dataset.connected to "true" once both fields are non-empty,
 * which this waits on as proof the extension is genuinely paired rather
 * than just assuming the click worked.
 */
export async function savePairingIntoExtension(sidePanel: Page, pairing: PairingCredentials): Promise<void> {
  await sidePanel.locator("#ingest-url").fill(pairing.ingestUrl);
  await sidePanel.locator("#extension-token").fill(pairing.token);
  await sidePanel.locator("#save-settings").click();
  await sidePanel.waitForFunction(() => document.body.dataset.connected === "true", undefined, { timeout: 10_000 });
}

/**
 * Finds the tabId of an already-open page by URL, from inside an extension
 * page's own chrome.* API access (any extension page — side panel,
 * background, etc. — can call chrome.tabs.query with the "tabs" permission,
 * which this extension already has in manifest.json).
 */
export async function getTabId(sidePanel: Page, url: string): Promise<number> {
  const tabId = await sidePanel.evaluate(async (targetUrl) => {
    const tabs = await chrome.tabs.query({ url: targetUrl });
    return tabs[0]?.id;
  }, url);
  if (typeof tabId !== "number") throw new Error(`No open extension-visible tab matches ${url}`);
  return tabId;
}

/**
 * sidepanel.js's own button handlers (start-picker/start-visual/save-page)
 * all call chrome.tabs.query({active: true, currentWindow: true}) to find
 * their target tab, matching a real toolbar-icon click where the Side Panel
 * sits alongside the page the user was already looking at. Opening
 * sidepanel.html as its own Playwright tab makes THAT tab the active one
 * instead, so this explicitly re-activates the fixture tab first — a real
 * chrome.tabs API call, not a bypass of sidepanel.js's own logic, which is
 * exercised unmodified once the active tab is correct again.
 */
export async function activateTab(sidePanel: Page, tabId: number): Promise<void> {
  await sidePanel.evaluate(async (id) => {
    await chrome.tabs.update(id, { active: true });
  }, tabId);
}

/**
 * Polls the service worker's own "magpie:capture-status" message (the same
 * one sidepanel.js checks on open to decide whether to disable its capture
 * buttons) until the single-flight `captureInFlight` lock in
 * extension/service-worker.js clears. Local AI-routing calls can be slow —
 * `npx base44 dev` proxies AI Gateway calls to production rather than
 * running them locally (see docs/ENGINEERING_NOTES.md) — and a Clip row
 * already existing in the backend does NOT mean the extension's own fetch()
 * to ingest-clip has returned yet (the Clip is created before routing
 * finishes, but the extension is still awaiting the full response). Callers
 * that need to start a second real capture (e.g. a duplicate-retry check)
 * must wait for this to clear first, or sidepanel.js's own buttons stay
 * disabled and the retry action never actually fires.
 */
export async function waitForCaptureIdle(sidePanel: Page, timeoutMs = 60_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const status = await sidePanel.evaluate(
      () =>
        new Promise((resolve) => {
          chrome.runtime.sendMessage({ type: "magpie:capture-status" }, resolve);
        }),
    );
    if (!(status as { inFlight?: boolean } | undefined)?.inFlight) return;
    await sidePanel.waitForTimeout(300);
  }
  throw new Error("Timed out waiting for the extension's single-flight capture lock to clear");
}

export type CaptureTabResult = {
  ok: boolean;
  error?: string;
  result?: {
    accepted?: boolean;
    duplicate?: boolean;
    capture_status?: string;
    clip_id?: string;
    routing_status?: string;
    routing_reason_code?: string;
    dashboard_url?: string;
  };
};

/**
 * Sends the real "magpie:capture-tab" runtime message that
 * extension/service-worker.js already handles in production (sidepanel.js's
 * own "Save page" button uses exactly this message for page-mode captures).
 * The service worker routes it through the same withCaptureLock(() =>
 * captureFromTab(tabId, mode)) pipeline a right-click context-menu item
 * would use — captureFromTab, buildContextPayload, the screenshot step, and
 * submitCapture are all unmodified production code.
 *
 * This is how selection/link/image modes are driven in this suite: Chromium
 * exposes no automatable API for clicking a *native* OS context-menu item
 * (a well-known Playwright/CDP limitation, not specific to this extension),
 * so tests instead fire a real `contextmenu` DOM event on the target
 * element first (which is all content.js's own listener needs to record
 * `lastContextTarget` for real) and then call this existing message type
 * directly instead of the unautomatable menu click. See
 * docs/ENGINEERING_NOTES.md for the full writeup of this limitation.
 */
export async function triggerCaptureTab(sidePanel: Page, tabId: number, mode: string): Promise<CaptureTabResult> {
  return sidePanel.evaluate(
    async ({ tabId: id, mode: captureMode }) => {
      return await chrome.runtime.sendMessage({ type: "magpie:capture-tab", tabId: id, mode: captureMode });
    },
    { tabId, mode },
  );
}

/**
 * Waits for the capture-result toast to be fully removed from the DOM
 * (content.js's own showToast() removes the element itself after its
 * lifetime timer, not just hides it). Page mode reads
 * `document.body?.innerText` for raw_text, and the toast is real DOM content
 * appended to `document.body` — so a second page-mode capture fired while a
 * prior result toast is still showing captures the toast's own text too,
 * producing a different content_hash and silently defeating the B8 dedupe
 * check for rapid same-page re-captures. This is a genuine, narrow product
 * finding surfaced by this suite, not a test bug — documented in
 * docs/ENGINEERING_NOTES.md and left unfixed per the issue #19 Phase 1
 * scope. capture-page.spec.ts calls this before its retry so the test
 * verifies the dedupe contract under normal conditions rather than being
 * confounded by this gap.
 */
export async function waitForToastGone(page: Page, timeoutMs = 15_000): Promise<void> {
  await page.locator("#magpie-capture-toast").waitFor({ state: "detached", timeout: timeoutMs }).catch(() => {
    // If it never appeared at all there is nothing to wait for.
  });
}

/** Reads the content-script toast (#magpie-capture-toast) — real production
 * UI, not a test hook — as a signal that a picker-driven (element/visual)
 * capture finished, since those flows have no direct message-response value
 * to await from outside the content script's isolated world. */
export async function waitForToastState(page: Page, states: string[], timeoutMs = 30_000): Promise<string> {
  const locator = page.locator("#magpie-capture-toast");
  await locator.waitFor({ state: "attached", timeout: timeoutMs });
  await page
    .waitForFunction(
      (wantedStates) => {
        const toast = document.getElementById("magpie-capture-toast");
        return !!toast && wantedStates.includes(toast.dataset.state || "");
      },
      states,
      { timeout: timeoutMs },
    )
    .catch(() => {
      // Fall through — caller re-reads the current state below and can
      // assert/report exactly what it was instead of a bare timeout.
    });
  return (await locator.getAttribute("data-state")) || "";
}
