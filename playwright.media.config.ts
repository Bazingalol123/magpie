import { defineConfig } from "@playwright/test";

// Records real onboarding walkthrough screenshots (later encoded to GIF by
// scripts/encode-onboarding-gifs.mjs) by driving the same real unpacked
// extension against a real local `npx base44 dev` backend that
// tests-e2e/specs already proves works (playwright.config.ts). Kept as a
// separate config/testDir on purpose: this is a media-generation utility,
// not regression coverage, so it must never run as part of `npm run
// test:e2e` or ci.yml.
export default defineConfig({
  testDir: "./tests-e2e/media-specs",
  timeout: 120_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  globalSetup: "./tests-e2e/global-setup.ts",
  globalTeardown: "./tests-e2e/global-teardown.ts",
  use: {
    trace: "off",
    screenshot: "off",
  },
});
