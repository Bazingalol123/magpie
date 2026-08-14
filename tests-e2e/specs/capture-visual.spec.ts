import { test, expect, readOwner, readRuntime } from "../helpers/extension-test";
import { createOwnerClient, countClipsForSource, waitForNewClip } from "../helpers/backend";
import { activateTab, getTabId, openPopup, waitForToastState } from "../helpers/capture";

// Visual mode: a user-drawn crop rectangle plus nearby visible text, with a
// screenshot attached (docs/V3_1_PRODUCT_AND_RISK_PLAN.md's multi-mode
// capture contract). There is no keyboard shortcut for visual mode in
// production (chrome.commands only maps to element mode) — only the popup's
// "Start visual snip" button — so this drives that real button, then
// performs a real drag gesture on the page exactly as a user would.
test("visual snip captures a cropped rectangle with visible-text evidence, and dedupes an identical retry", async ({
  context,
  extensionId,
}) => {
  const runtime = readRuntime();
  const owner = readOwner();
  const { client } = await createOwnerClient();

  const url = `${runtime.fixturesBaseUrl}/listing-1.html`;
  const page = await context.newPage();
  await page.goto(url);

  const tabId = await getTabId(await openPopup(context, extensionId), url);
  const rect = { x: 60, y: 80, width: 220, height: 160 };

  async function performSnip() {
    const popup = await openPopup(context, extensionId);
    await activateTab(popup, tabId);
    await popup.locator("#start-visual").click(); // popup closes itself after starting the snip in content.js
    await page.bringToFront();
    await page.locator("#magpie-snip-overlay").waitFor({ state: "attached", timeout: 10_000 });
    await page.mouse.move(rect.x, rect.y);
    await page.mouse.down();
    await page.mouse.move(rect.x + rect.width, rect.y + rect.height, { steps: 5 });
    await page.mouse.up();
    await waitForToastState(page, ["success", "review", "error"]);
  }

  const notBeforeIso = new Date().toISOString();
  await performSnip();

  const clip = await waitForNewClip(client, {
    ownerId: owner.id,
    captureMode: "visual",
    notBeforeIso,
    sourceUrlIncludes: "listing-1.html",
  });

  expect(clip.capture_mode).toBe("visual");
  expect(clip.source_url).toBe(url);
  expect(clip.raw_html || "").toBe("");
  expect(clip.raw_text.length).toBeGreaterThan(0);
  // Screenshot upload is documented best-effort (B2 / docs/BUGS_AND_BEHAVIORS.md);
  // see docs/ENGINEERING_NOTES.md for what this run actually observed
  // against the local base44 dev upload path.
  if (clip.screenshot_id) {
    expect(typeof clip.screenshot_id).toBe("string");
  }

  // Retry with the identical rect on the unchanged page: same source_url +
  // mode + sampled evidence text -> same content_hash -> duplicate (B8),
  // not a second Clip.
  await performSnip();

  const count = await countClipsForSource(client, { ownerId: owner.id, captureMode: "visual", sourceUrl: url });
  expect(count).toBe(1);
});
