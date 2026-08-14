import { test, expect, readOwner, readRuntime } from "../helpers/extension-test";
import { createOwnerClient, countClipsForSource, waitForNewClip } from "../helpers/backend";
import { waitForToastState } from "../helpers/capture";

// Element mode: this is the same card-grid shape that caused the real B4 bug
// (docs/BUGS_AND_BEHAVIORS.md) — clicking a card on a list-style page must
// resolve to that card's own detail URL (from its nested <a href>), not the
// index page's URL. Driven entirely through the real element picker:
// content.js listens for Alt+Shift+M itself (independent of chrome.commands'
// native routing, specifically so it works "on any keyboard layout" per its
// own comment), then a real hover+click completes the capture. There is no
// synthetic bypass in this spec at all.
test("element capture resolves the clicked card's own detail URL, not the index page, and dedupes on retry", async ({
  context,
}) => {
  const runtime = readRuntime();
  const owner = readOwner();
  const { client } = await createOwnerClient();

  const indexUrl = `${runtime.fixturesBaseUrl}/index.html`;
  const detailUrl = `${runtime.fixturesBaseUrl}/listing-2.html`;

  const page = await context.newPage();
  await page.goto(indexUrl);
  await page.bringToFront();

  const heading = page.locator('[data-testid="listing-card-2"] h2');

  const notBeforeIso = new Date().toISOString();
  await page.keyboard.press("Alt+Shift+M");
  await expect(page.locator("#magpie-capture-toast")).toBeVisible({ timeout: 10_000 });
  await heading.hover();
  await heading.click();
  await waitForToastState(page, ["success", "review", "error"]);

  const clip = await waitForNewClip(client, {
    ownerId: owner.id,
    captureMode: "element",
    notBeforeIso,
    sourceUrlIncludes: "listing-2.html",
  });

  expect(clip.capture_mode).toBe("element");
  expect(clip.source_url).toBe(detailUrl); // NOT indexUrl — the B4 regression shape this fixture targets
  expect(clip.source_url).not.toBe(indexUrl);
  expect(clip.raw_html.length).toBeGreaterThan(0);
  expect(clip.raw_html.length).toBeLessThanOrEqual(12_000);
  expect(clip.raw_text.length).toBeLessThanOrEqual(20_000);

  // Retry: clicking the identical card again (fresh picker session) must
  // dedupe by content_hash (B8), not create a second Clip.
  await page.keyboard.press("Alt+Shift+M");
  await heading.hover();
  await heading.click();
  await waitForToastState(page, ["success", "review", "error"]);

  const count = await countClipsForSource(client, { ownerId: owner.id, captureMode: "element", sourceUrl: detailUrl });
  expect(count).toBe(1);
});
