import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test, readRuntime } from "../helpers/extension-test";
import { openSidePanel, activateTab, getTabId, waitForToastState } from "../helpers/capture";

// Records the two capture modes desktop-capture.gif doesn't cover: the real
// hover highlight content.js draws during element-picker mode, and the real
// drag rectangle it draws during a visual snip. Both are genuine page DOM
// (the picker highlight div / #magpie-snip-overlay), so both are real
// screenshots -- unlike opening the Side Panel itself or a native right-click
// context menu, neither of which any browser-automation tool (this one
// included) can drive or screenshot; see docs/ENGINEERING_NOTES.md.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.resolve(__dirname, "../.media/capture-modes");

async function shoot(target: { screenshot: (options: { path: string }) => Promise<Buffer> }, name: string) {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  await target.screenshot({ path: path.join(OUT_DIR, name) });
}

test("record the element-picker hover highlight and capture", async ({ context }) => {
  const runtime = readRuntime();
  const url = `${runtime.fixturesBaseUrl}/index.html`;
  const page = await context.newPage();
  await page.setViewportSize({ width: 1180, height: 760 });
  await page.goto(url);
  await page.bringToFront();

  const heading = page.locator('[data-testid="listing-card-2"] h2');
  await page.keyboard.press("Alt+Shift+M");
  await page.locator("#magpie-capture-toast").waitFor({ state: "attached", timeout: 10_000 });
  await heading.hover();
  await page.waitForTimeout(200); // let content.js's highlight overlay paint over the hovered card
  await shoot(page, "00-element-hover.png");

  await heading.click();
  await waitForToastState(page, ["success", "review", "error"]);
  await shoot(page, "01-element-captured.png");
});

test("record the visual snip drag and capture", async ({ context, extensionId }) => {
  const runtime = readRuntime();
  const url = `${runtime.fixturesBaseUrl}/listing-1.html`;
  const rect = { x: 60, y: 140, width: 260, height: 180 };

  const page = await context.newPage();
  await page.setViewportSize({ width: 1180, height: 760 });
  await page.goto(url);

  const tabId = await getTabId(await openSidePanel(context, extensionId), url);
  const sidePanel = await openSidePanel(context, extensionId);
  await activateTab(sidePanel, tabId);
  await sidePanel.locator("#start-visual").click();
  await page.bringToFront();
  await page.locator("#magpie-snip-overlay").waitFor({ state: "attached", timeout: 10_000 });

  await page.mouse.move(rect.x, rect.y);
  await page.mouse.down();
  await page.mouse.move(rect.x + rect.width, rect.y + rect.height, { steps: 8 });
  await shoot(page, "02-snip-dragging.png");
  await page.mouse.up();

  await waitForToastState(page, ["success", "review", "error"]);
  await shoot(page, "03-snip-captured.png");

  console.log(`[record-capture-modes] Wrote frames to ${OUT_DIR}`);
});
