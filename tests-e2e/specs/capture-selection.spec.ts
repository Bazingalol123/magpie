import { test, expect, readOwner, readRuntime } from "../helpers/extension-test";
import { createOwnerClient, countClipsForSource, getClip } from "../helpers/backend";
import { getTabId, openPopup, triggerCaptureTab } from "../helpers/capture";

// Selection mode: selected text + bounded surrounding text, never full-page
// HTML. There is no popup button or keyboard shortcut for selection mode in
// production — only the right-click context menu — and Chromium's native
// context-menu items are not automatable via Playwright/CDP (see the doc
// comment on triggerCaptureTab in helpers/capture.ts). This test sets a
// real window.getSelection() range (what a manual drag-select would leave
// behind) and then calls the same "magpie:capture-tab" runtime message
// popup.js's own "Save page" button already uses in production, which
// content.js's buildContextPayload("selection", {}) falls back to reading
// live from the page exactly as it would for a real selection-menu click.
test("selection capture reads the real page selection with no raw_html, and dedupes on retry", async ({
  context,
  extensionId,
}) => {
  const runtime = readRuntime();
  const owner = readOwner();
  const { client } = await createOwnerClient();

  const url = `${runtime.fixturesBaseUrl}/article.html`;
  const page = await context.newPage();
  await page.goto(url);
  await page.evaluate(() => {
    const paragraph = document.querySelector("#selectable-paragraph");
    if (!paragraph) throw new Error("Fixture is missing #selectable-paragraph");
    const range = document.createRange();
    range.selectNodeContents(paragraph);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
  });

  const popup = await openPopup(context, extensionId);
  const tabId = await getTabId(popup, url);

  const first = await triggerCaptureTab(popup, tabId, "selection");
  expect(first.ok, `capture-tab failed: ${first.error}`).toBe(true);
  expect(first.result?.capture_status).toBe("new");
  const clipId = first.result?.clip_id;
  expect(clipId).toBeTruthy();

  const clip = await getClip(client, clipId as string);
  expect(clip.capture_mode).toBe("selection");
  expect(clip.source_url).toBe(url);
  expect(clip.raw_html || "").toBe("");
  expect(clip.raw_text).toContain("hooch");
  expect(clip.raw_text.length).toBeLessThanOrEqual(20_000);

  // Retry: the selection is still live on the page, so the identical
  // capture must dedupe by content_hash (B8) rather than create a second Clip.
  const retry = await triggerCaptureTab(popup, tabId, "selection");
  expect(retry.ok, `capture-tab retry failed: ${retry.error}`).toBe(true);
  expect(retry.result?.capture_status).toBe("duplicate");
  expect(retry.result?.clip_id).toBe(clipId);

  const count = await countClipsForSource(client, { ownerId: owner.id, captureMode: "selection", sourceUrl: url });
  expect(count).toBe(1);
});
