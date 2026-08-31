import type { Page } from "@playwright/test";
import type { TestOwner } from "./config";

/**
 * Logs the dashboard page in via the real SDK method — base44.auth.
 * loginViaEmailPassword(email, password) — called through the dev-only
 * window.__magpieBase44 hook added in src/api/base44Client.js, per the
 * issue #19 Phase 1 decision to avoid hand-injecting a session into
 * localStorage/cookies (docs/DECISIONS.md). loginViaEmailPassword() persists
 * the token to localStorage itself (base44_access_token), so a reload is
 * enough for the app's own base44 client instance to pick it up on
 * construction and for the mount-time `base44.auth.me()` effect in
 * src/App.jsx to resolve the signed-in user.
 */
export async function loginDashboard(page: Page, baseUrl: string, owner: Pick<TestOwner, "email" | "password">) {
  await page.goto(baseUrl);
  await page.waitForFunction(() => Boolean((window as any).__magpieBase44), undefined, { timeout: 20_000 });
  await page.evaluate(
    async ({ email, password }) => {
      const base44 = (window as any).__magpieBase44;
      const response = await base44.auth.loginViaEmailPassword(email, password);
      if (!response?.access_token) {
        throw new Error("loginViaEmailPassword did not return an access_token");
      }
    },
    { email: owner.email, password: owner.password },
  );
  await page.reload();
  await page.locator(".app-shell").waitFor({ state: "visible", timeout: 20_000 });
}

export type PairingCredentials = { ingestUrl: string; token: string };

/**
 * Drives the real "Pair extension" dialog end to end: clicks the dashboard
 * button, calls the real create-extension-pairing function through the UI,
 * and reads the ingest URL + one-time token back out of the rendered
 * PairingDialog (src/App.jsx) exactly as a human pairing the extension
 * would. This exercises the real trust boundary the issue asks for, rather
 * than seeding chrome.storage.local directly.
 *
 * Scoped to the persistent desktop account rail (`.nav-account`), not just
 * any "Pair extension" button: a brand-new unpaired owner also sees a Nest
 * CTA and the optional capture guide contains another one. The account-rail
 * action is the stable desktop entry and remains present after pairing as
 * "Pair another browser".
 */
export async function pairExtensionViaDialog(page: Page): Promise<PairingCredentials> {
  // A newly registered owner now starts inside the real activation tour.
  // This helper deliberately tests the direct account-rail pairing path,
  // so dismiss the tour exactly as a user would before clicking underneath
  // it. Without this, driver.js's overlay correctly intercepts the click and
  // the harness times out before any capture flow can run.
  const skipTour = page.getByRole("button", { name: "Skip tour", exact: true });
  if (await skipTour.isVisible().catch(() => false)) {
    await skipTour.click();
    await skipTour.waitFor({ state: "hidden", timeout: 10_000 });
  }
  await page.locator(".app-navigation .nav-account").getByRole("button", { name: /Pair extension/i }).click();
  const dialog = page.locator(".pairing-dialog");
  await dialog.waitFor({ state: "visible", timeout: 15_000 });

  const ingestUrl = (await page.locator(".pairing-value:not(.token) code").innerText()).trim();
  const token = (await page.locator(".pairing-value.token code").innerText()).trim();
  if (!ingestUrl || !token) {
    throw new Error(`Pairing dialog did not render both values (ingestUrl="${ingestUrl}", token present=${!!token})`);
  }

  await dialog.getByRole("button", { name: /Finish later/i }).click();
  await dialog.waitFor({ state: "hidden", timeout: 10_000 });
  return { ingestUrl, token };
}
