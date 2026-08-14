import { test, expect, readOwner, readRuntime } from "../helpers/extension-test";
import { createOwnerClient, countClipsForSource, getClip } from "../helpers/backend";
import { getTabId, openPopup, triggerCaptureTab } from "../helpers/capture";

// Image mode: right-clicked image crop + alt/caption + surrounding text
// (docs/V3_1_PRODUCT_AND_RISK_PLAN.md's multi-mode capture contract). Real
// `contextmenu` DOM event on the <img> sets content.js's lastContextTarget,
// same pattern as capture-link.spec.ts; see helpers/capture.ts's
// triggerCaptureTab doc comment for why the native menu-item click itself
// can't be automated.
test("image capture reads the right-clicked image's alt/caption text, and dedupes on retry", async ({
  context,
  extensionId,
}) => {
  const runtime = readRuntime();
  const owner = readOwner();
  const { client } = await createOwnerClient();

  const url = `${runtime.fixturesBaseUrl}/listing-1.html`;
  const page = await context.newPage();
  await page.goto(url);

  const image = page.locator('[data-testid="listing-detail"] figure img');
  await image.click({ button: "right" });
  await page.keyboard.press("Escape").catch(() => {});

  const popup = await openPopup(context, extensionId);
  const tabId = await getTabId(popup, url);

  const first = await triggerCaptureTab(popup, tabId, "image");
  expect(first.ok, `capture-tab failed: ${first.error}`).toBe(true);
  expect(first.result?.capture_status).toBe("new");
  const clipId = first.result?.clip_id;
  expect(clipId).toBeTruthy();

  const clip = await getClip(client, clipId as string);
  expect(clip.capture_mode).toBe("image");
  expect(clip.source_url).toBe(url);
  // From the <figcaption>"Living room, facing the river"</figcaption>.
  expect(clip.raw_text).toContain("river");
  // Screenshot upload is documented best-effort (B2 / docs/BUGS_AND_BEHAVIORS.md):
  // a storage failure must not discard an otherwise-valid text capture, so
  // this only sanity-checks the field's shape when present rather than
  // hard-requiring it — see docs/ENGINEERING_NOTES.md for what was actually
  // observed against the local base44 dev upload path in this run.
  if (clip.screenshot_id) {
    expect(typeof clip.screenshot_id).toBe("string");
  }

  // Retry: right-clicking + capturing the identical image again must dedupe
  // by content_hash (B8), not create a second Clip.
  await image.click({ button: "right" });
  await page.keyboard.press("Escape").catch(() => {});
  const retry = await triggerCaptureTab(popup, tabId, "image");
  expect(retry.ok, `capture-tab retry failed: ${retry.error}`).toBe(true);
  expect(retry.result?.capture_status).toBe("duplicate");
  expect(retry.result?.clip_id).toBe(clipId);

  const count = await countClipsForSource(client, { ownerId: owner.id, captureMode: "image", sourceUrl: url });
  expect(count).toBe(1);
});
