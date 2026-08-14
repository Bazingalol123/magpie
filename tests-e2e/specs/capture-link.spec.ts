import { test, expect, readOwner, readRuntime } from "../helpers/extension-test";
import { createOwnerClient, countClipsForSource, getClip } from "../helpers/backend";
import { getTabId, openPopup, triggerCaptureTab } from "../helpers/capture";

// Link mode: this is the exact page shape that caused the real B4 bug
// (docs/BUGS_AND_BEHAVIORS.md) — a card-grid index page where the captured
// evidence must resolve to the clicked card's own detail URL, with the
// index page retained as context_url, and no server-side fetch of the link
// target (docs/V3_1_PRODUCT_AND_RISK_PLAN.md's multi-mode capture contract).
// A real `contextmenu` DOM event is fired on the card first (all
// content.js's own listener needs to record lastContextTarget for real);
// see helpers/capture.ts's triggerCaptureTab doc comment for why the actual
// native context-menu item click can't be automated.
test("link capture resolves the right-clicked card's own URL, keeps the index page as context, and dedupes on retry", async ({
  context,
  extensionId,
}) => {
  const runtime = readRuntime();
  const owner = readOwner();
  const { client } = await createOwnerClient();

  const indexUrl = `${runtime.fixturesBaseUrl}/index.html`;
  const detailUrl = `${runtime.fixturesBaseUrl}/listing-3.html`;

  const page = await context.newPage();
  await page.goto(indexUrl);

  const card = page.locator('[data-testid="listing-card-3"] a.card-link');
  await card.click({ button: "right" });
  await page.keyboard.press("Escape").catch(() => {});

  const popup = await openPopup(context, extensionId);
  const tabId = await getTabId(popup, indexUrl);

  const first = await triggerCaptureTab(popup, tabId, "link");
  expect(first.ok, `capture-tab failed: ${first.error}`).toBe(true);
  expect(first.result?.capture_status).toBe("new");
  const clipId = first.result?.clip_id;
  expect(clipId).toBeTruthy();

  const clip = await getClip(client, clipId as string);
  expect(clip.capture_mode).toBe("link");
  expect(clip.source_url).toBe(detailUrl);
  expect(clip.source_url).not.toBe(indexUrl); // the B4 regression shape this fixture targets
  expect(clip.context_url).toBe(indexUrl);
  expect(clip.raw_text).toContain("Loft above the market hall");
  expect(clip.raw_html || "").toBe("");

  // Retry: right-clicking + capturing the identical card again must dedupe
  // by content_hash (B8), not create a second Clip.
  await card.click({ button: "right" });
  await page.keyboard.press("Escape").catch(() => {});
  const retry = await triggerCaptureTab(popup, tabId, "link");
  expect(retry.ok, `capture-tab retry failed: ${retry.error}`).toBe(true);
  expect(retry.result?.capture_status).toBe("duplicate");
  expect(retry.result?.clip_id).toBe(clipId);

  const count = await countClipsForSource(client, { ownerId: owner.id, captureMode: "link", sourceUrl: detailUrl });
  expect(count).toBe(1);
});
