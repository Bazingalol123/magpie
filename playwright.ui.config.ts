import { defineConfig, devices } from "@playwright/test";

// Rendered-product release gate. Unlike the extension capture matrix, these
// projects use ordinary browser pages and validate the dashboard exactly as
// desktop, Android, and iPhone users see and operate it.
export default defineConfig({
  testDir: "./tests-e2e/ui-specs",
  timeout: 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  globalSetup: "./tests-e2e/global-setup.ts",
  globalTeardown: "./tests-e2e/global-teardown.ts",
  use: {
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "desktop-chrome", use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 800 } } },
    { name: "android-pixel-7", use: { ...devices["Pixel 7"] } },
    { name: "iphone-14", use: { ...devices["iPhone 14"] } },
  ],
});
