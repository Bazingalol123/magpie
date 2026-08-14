import { defineConfig } from "@playwright/test";

// Magpie Chrome capture integration matrix (Issue #19 Phase 1 / G8).
//
// This suite drives the real unpacked MV3 extension against a real local
// `npx base44 dev` backend + dashboard, with local static HTML fixtures
// standing in for a live site (docs/DECISIONS.md, 2026-08 "local fixtures
// over live site" entry). Tests do not use Playwright's default `page`
// fixture — chromium.launchPersistentContext() is required to load an
// unpacked extension, so specs import `test`/`expect` from
// `tests-e2e/helpers/extension-test.ts` instead of `@playwright/test`
// directly. See docs/BUILD_GUIDE.md for the full checkpoint writeup.
export default defineConfig({
  testDir: "./tests-e2e/specs",
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  // Serial only: every spec shares one already-paired extension Chrome
  // profile (tests-e2e/global-setup.ts pairs it once, not per spec), one
  // local base44 backend, and one test owner's Clip rows. Parallel workers
  // would race the extension's own single-flight `captureInFlight` lock in
  // extension/service-worker.js and the shared user-data-dir's profile lock.
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  globalSetup: "./tests-e2e/global-setup.ts",
  globalTeardown: "./tests-e2e/global-teardown.ts",
  use: {
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
});
