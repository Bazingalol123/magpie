import { test as base } from "@playwright/test";
import type { BrowserContext } from "@playwright/test";
import { getExtensionId, launchExtensionContext } from "./browser";
import { readOwner, readRuntime } from "./config";

type Fixtures = {
  context: BrowserContext;
  extensionId: string;
};

/**
 * Every spec imports `test`/`expect` from here instead of "@playwright/test"
 * directly — the default `page` fixture launches a plain (non-persistent)
 * browser, which cannot load an unpacked extension at all. `context` here
 * reopens the SAME on-disk Chrome profile global-setup.ts paired the
 * extension in once for the whole run (see helpers/browser.ts), so every
 * spec starts already paired without repeating the dashboard/pairing-dialog
 * flow per test.
 */
export const test = base.extend<Fixtures>({
  context: async ({}, use) => {
    const context = await launchExtensionContext();
    await use(context);
    await context.close();
  },
  extensionId: async ({ context }, use) => {
    await use(await getExtensionId(context));
  },
});

export const expect = test.expect;
export { readOwner, readRuntime };
