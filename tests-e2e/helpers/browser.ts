import { chromium, type BrowserContext } from "@playwright/test";
import { EXTENSION_DIR, PROFILE_DIR } from "./config";

/**
 * Loads the real unpacked extension/ directory into a persistent Chromium
 * profile — chromium.launchPersistentContext() is required for
 * --load-extension; Playwright's normal chromium.launch() cannot load
 * extensions at all.
 *
 * Headless note (found while building this harness, see
 * docs/ENGINEERING_NOTES.md): passing `headless: true` alone does NOT work
 * for extensions on Playwright 1.62 — Playwright silently substitutes a
 * separate, lighter "chromium-headless-shell" binary for `headless: true`,
 * and that binary does not support --load-extension at all (the extension's
 * service worker simply never registers, with no error). The working
 * combination is `headless: false` (so Playwright launches the real,
 * full Chromium binary) plus an explicit `--headless=new` argument, which
 * makes that same full binary run headless itself. This still requires no
 * Xvfb/display — confirmed working in this sandboxed Windows environment.
 *
 * Every caller (global-setup.ts's one-time pairing pass, and each spec via
 * extension-test.ts) points at the SAME PROFILE_DIR on disk so the
 * extension's chrome.storage.local pairing token set up once in global
 * setup survives into every spec's fresh context — see the "Extension
 * pairing" note in docs/BUILD_GUIDE.md. Chrome only allows one live process
 * per user-data-dir, which is fine because playwright.config.ts pins
 * workers: 1.
 */
export async function launchExtensionContext(headless = true): Promise<BrowserContext> {
  return chromium.launchPersistentContext(PROFILE_DIR, {
    headless: false,
    args: [
      `--disable-extensions-except=${EXTENSION_DIR}`,
      `--load-extension=${EXTENSION_DIR}`,
      ...(headless ? ["--headless=new"] : []),
    ],
  });
}

/** MV3 service workers can take a beat to register after the context opens
 * (or after the profile's extension state is first read from disk), so this
 * waits for one rather than assuming context.serviceWorkers() is already
 * populated. */
export async function getExtensionId(context: BrowserContext): Promise<string> {
  let [worker] = context.serviceWorkers();
  if (!worker) {
    worker = await context.waitForEvent("serviceworker", { timeout: 20_000 });
  }
  return worker.url().split("/")[2];
}
