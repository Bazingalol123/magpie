import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test, readOwner, readRuntime } from "../helpers/extension-test";
import { createOwnerClient, waitForNewClip } from "../helpers/backend";
import { activateTab, getTabId, openSidePanel } from "../helpers/capture";
import { loginDashboard } from "../helpers/dashboard";

// Records real screenshots of the actual Side Panel and dashboard UI walking
// through one page capture, for scripts/encode-onboarding-gifs.mjs to turn
// into the onboarding Method screen's Desktop-capture GIF. Every frame is a
// real screenshot of real production UI driven through the same message
// types tests-e2e/specs already exercises (capture-page.spec.ts) -- nothing
// here is staged/faked, so a real product change will make this recording
// stale exactly the way a real screenshot should.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.resolve(__dirname, "../.media/desktop-capture");

async function shoot(target: { screenshot: (options: { path: string }) => Promise<Buffer> }, name: string) {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  await target.screenshot({ path: path.join(OUT_DIR, name) });
}

test("record the desktop Side Panel capture flow", async ({ context, extensionId }) => {
  const runtime = readRuntime();
  const owner = readOwner();
  const { client } = await createOwnerClient();

  const url = `${runtime.fixturesBaseUrl}/listing-1.html`;
  const page = await context.newPage();
  await page.setViewportSize({ width: 1180, height: 760 });
  await page.goto(url);
  await shoot(page, "00-page.png");

  const sidePanel = await openSidePanel(context, extensionId);
  // The real Side Panel renders in a narrow docked strip, not a full tab --
  // match that so the recorded frames look like the real product surface
  // instead of a stretched full-width page.
  await sidePanel.setViewportSize({ width: 380, height: 760 });
  const tabId = await getTabId(sidePanel, url);
  await activateTab(sidePanel, tabId);
  await sidePanel.waitForFunction(() => document.body.dataset.connected === "true", undefined, { timeout: 10_000 });
  await shoot(sidePanel, "01-sidepanel-ready.png");

  const notBeforeIso = new Date().toISOString();
  await sidePanel.locator("#save-page").click();
  // "Capturing…" is set synchronously by the click handler before the
  // network call resolves (extension/sidepanel.js) -- no wait needed, but a
  // short settle avoids racing the paint.
  await sidePanel.waitForTimeout(150);
  await shoot(sidePanel, "02-sidepanel-capturing.png");

  await sidePanel.locator("#status").filter({ hasText: /Captured/i }).first().waitFor({ timeout: 20_000 });
  await shoot(sidePanel, "03-sidepanel-captured.png");

  const clip = await waitForNewClip(client, {
    ownerId: owner.id,
    captureMode: "page",
    notBeforeIso,
    sourceUrlIncludes: "listing-1.html",
  });

  const dashboardPage = await context.newPage();
  await dashboardPage.setViewportSize({ width: 1280, height: 800 });
  await loginDashboard(dashboardPage, runtime.frontendBaseUrl, owner);
  // Give the routed Collection a moment to appear in the sidebar/table after
  // AI routing finished server-side (confirmed above via waitForNewClip).
  await dashboardPage.waitForTimeout(1500);
  await dashboardPage.reload();
  await dashboardPage.waitForLoadState("networkidle");
  await shoot(dashboardPage, "04-dashboard-item-landed.png");

  console.log(`[record-desktop-capture] Wrote frames to ${OUT_DIR} (routed clip ${clip.id}, routing_status=${clip.routing_status})`);
});
