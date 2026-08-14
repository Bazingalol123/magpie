import { test, expect, readOwner, readRuntime } from "../helpers/extension-test";
import { createOwnerClient, countClipsForSource, waitForNewClip } from "../helpers/backend";
import { activateTab, getTabId, openPopup, waitForCaptureIdle, waitForToastGone } from "../helpers/capture";

// Page mode: title + meta description + bounded visible text, no full-page
// HTML (docs/V3_1_PRODUCT_AND_RISK_PLAN.md's multi-mode capture contract).
// Driven through the real popup "Save page" button — the only mode with a
// direct popup UI entry point besides element/visual.
test("page capture sends bounded text with no raw_html, and dedupes on retry", async ({ context, extensionId }) => {
  const runtime = readRuntime();
  const owner = readOwner();
  const { client } = await createOwnerClient();

  const url = `${runtime.fixturesBaseUrl}/article.html`;
  const page = await context.newPage();
  await page.goto(url);

  const popup = await openPopup(context, extensionId);
  const tabId = await getTabId(popup, url);
  await activateTab(popup, tabId);

  const notBeforeIso = new Date().toISOString();
  await popup.locator("#save-page").click();
  // popup.js closes its own window ~450ms after a successful capture; don't
  // wait on the popup page itself past this point.

  const clip = await waitForNewClip(client, {
    ownerId: owner.id,
    captureMode: "page",
    notBeforeIso,
    sourceUrlIncludes: "article.html",
  });

  expect(clip.capture_mode).toBe("page");
  expect(clip.source_url).toBe(url);
  expect(clip.raw_html || "").toBe("");
  expect(clip.raw_text).toContain("sourdough");
  expect(clip.raw_text.length).toBeGreaterThan(0);
  expect(clip.raw_text.length).toBeLessThanOrEqual(20_000);

  // A Clip row existing in the backend does not guarantee the extension's
  // own fetch() to ingest-clip has returned yet — the Clip is written before
  // AI routing finishes, and local AI-routing calls proxy to production
  // (see helpers/capture.ts's waitForCaptureIdle doc comment and
  // docs/ENGINEERING_NOTES.md). Wait for the single-flight lock to clear
  // before starting the retry, or popup.js's own buttons stay disabled.
  const idleCheckPopup = await openPopup(context, extensionId);
  await waitForCaptureIdle(idleCheckPopup);
  await idleCheckPopup.close();

  // The result toast from the first capture is real DOM content on this
  // same page; page mode reads document.body.innerText wholesale, so a
  // retry fired while that toast is still showing would capture the toast's
  // own text too and never dedupe (see waitForToastGone's doc comment and
  // docs/ENGINEERING_NOTES.md for the finding this surfaced). Wait for it to
  // clear so this test verifies the real B8 dedupe contract, not that gap.
  await waitForToastGone(page);

  // Retry: the identical page save must dedupe by content_hash (B8), not
  // create a second Clip.
  const popup2 = await openPopup(context, extensionId);
  await activateTab(popup2, tabId);
  await popup2.locator("#save-page").click();
  await popup2.locator("#status").filter({ hasText: /Captured|already|saved/i }).first().waitFor({ timeout: 15_000 }).catch(() => {});

  const count = await countClipsForSource(client, { ownerId: owner.id, captureMode: "page", sourceUrl: url });
  expect(count).toBe(1);
});
