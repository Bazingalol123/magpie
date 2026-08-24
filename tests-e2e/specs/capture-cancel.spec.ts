import { test, expect, readRuntime } from "../helpers/extension-test";
import { activateTab, getTabId, openSidePanel } from "../helpers/capture";

test("Escape cancels clipping from the page and from a focused Side Panel", async ({
  context,
  extensionId,
}) => {
  const runtime = readRuntime();
  const url = `${runtime.fixturesBaseUrl}/listing-1.html`;
  const page = await context.newPage();
  await page.goto(url);
  await page.bringToFront();

  // A host page is allowed to own Escape too. Magpie's modal capture listener
  // must run early enough that the site's bubbling handler cannot swallow it.
  await page.evaluate(() => {
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") event.stopImmediatePropagation();
    });
  });

  await page.keyboard.press("Alt+Shift+M");
  await expect(page.locator("#magpie-capture-picker")).toBeAttached();
  await page.keyboard.press("Escape");
  await expect(page.locator("#magpie-capture-picker")).toHaveCount(0);
  await expect(page.locator("#magpie-capture-toast")).toHaveCount(0);

  // Clicking a real Chrome Side Panel does not return keyboard focus to the
  // webpage. Its Escape handler therefore forwards cancellation to the exact
  // tab in which the snip began.
  const sidePanel = await openSidePanel(context, extensionId);
  const tabId = await getTabId(sidePanel, url);
  await activateTab(sidePanel, tabId);
  await sidePanel.locator("#start-visual").click();
  await expect(page.locator("#magpie-snip-overlay")).toBeAttached();

  await sidePanel.keyboard.press("Escape");
  await expect(page.locator("#magpie-snip-overlay")).toHaveCount(0);
  await expect(sidePanel.locator("#status")).toHaveText("Capture cancelled.");
});
