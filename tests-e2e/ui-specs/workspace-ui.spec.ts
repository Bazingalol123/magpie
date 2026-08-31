import { test, expect, type Page } from "@playwright/test";
import { readOwner, readRuntime } from "../helpers/config";

async function loginThroughVisibleUi(page: Page) {
  const runtime = readRuntime();
  const owner = readOwner();
  await page.goto(`${runtime.frontendBaseUrl}/login`);
  await page.getByLabel("Email address").fill(owner.email);
  await page.getByPlaceholder("At least 8 characters").fill(owner.password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.locator(".app-shell")).toBeVisible();
}

async function dismissActiveTour(page: Page) {
  const skip = page.getByRole("button", { name: "Skip tour", exact: true });
  if (await skip.waitFor({ state: "visible", timeout: 5_000 }).then(() => true).catch(() => false)) {
    await skip.click();
    await expect(page.locator(".driver-popover")).toBeHidden();
  }
}

async function replayTour(page: Page, mobile: boolean) {
  if (mobile) {
    await page.getByRole("button", { name: "Account menu" }).click();
    await page.getByRole("menuitem", { name: /Replay tour/i }).click();
  } else {
    await page.locator(".app-navigation").getByRole("button", { name: "Replay tour", exact: true }).click();
  }
  await expect(page.getByRole("dialog", { name: "Welcome to Magpie" })).toBeVisible();
}

test("core workspace surfaces are usable through rendered navigation", async ({ page }, testInfo) => {
  const mobile = testInfo.project.name !== "desktop-chrome";
  await loginThroughVisibleUi(page);
  await dismissActiveTour(page);

  if (mobile) {
    await page.locator('.mobile-bottom-nav').getByRole("button", { name: "Nest", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Nest", exact: true })).toBeVisible();
    await page.locator('.mobile-bottom-nav').getByRole("button", { name: "Collections", exact: true }).click();
    await expect(page).toHaveURL(/\/library$/);
    await page.locator('.mobile-bottom-nav').getByRole("button", { name: "Signals", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Signals", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Search", exact: true }).click();
  } else {
    const nav = page.locator(".app-navigation");
    await nav.getByRole("button", { name: "Nest", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Nest", exact: true })).toBeVisible();
    await nav.getByRole("button", { name: "Library", exact: true }).click();
    await expect(page).toHaveURL(/\/library$/);
    await nav.getByRole("button", { name: "Signals", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Signals", exact: true })).toBeVisible();
    await nav.locator('[data-tour="nav-search"]').click();
  }

  await expect(page).toHaveURL(/\/search$/);
  await expect(page.getByPlaceholder(/Search fields, captured text/)).toBeVisible();
});

test("the platform-appropriate onboarding tour is operable end to end", async ({ page }, testInfo) => {
  const mobile = testInfo.project.name !== "desktop-chrome";
  await loginThroughVisibleUi(page);
  await dismissActiveTour(page);
  await replayTour(page, mobile);

  await page.getByRole("button", { name: "Next", exact: true }).click();
  if (!mobile) {
    await expect(page.getByRole("dialog", { name: "Download the extension" })).toBeVisible();
    await page.getByRole("button", { name: "Skip tour", exact: true }).click();
    await expect(page.locator(".driver-popover")).toBeHidden();
    return;
  }

  await expect(page.getByRole("dialog", { name: "Add Magpie to your home screen" })).toBeVisible();
  await expect(page.locator('[data-tour="mobile-primary-action"]')).toBeVisible();
  await page.locator('[data-tour="mobile-primary-action"]').click();
  const installGuide = page.locator(".pairing-dialog").filter({ has: page.getByRole("button", { name: "Got it", exact: true }) });
  await expect(installGuide).toBeVisible();
  await installGuide.getByRole("button", { name: "Got it", exact: true }).click();
  await expect(installGuide).toBeHidden();

  const expectedSteps = [
    ["Nest", /\/nest$/],
    ["Library — where your captures live", /\/library$/],
    ["Signals", /\/signals$/],
    ["Search everything", /\/nest$/],
    ["Capturing happens on your computer", /\/nest$/],
  ] as const;
  for (const [title, url] of expectedSteps) {
    await page.getByRole("button", { name: "Next", exact: true }).click();
    await expect(page.getByRole("dialog", { name: title })).toBeVisible();
    await expect(page).toHaveURL(url);
  }
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await expect(page.locator(".driver-popover")).toBeHidden();
});
