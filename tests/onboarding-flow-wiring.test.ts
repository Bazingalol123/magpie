import { assert } from "jsr:@std/assert";

const root = new URL("../", import.meta.url);

Deno.test("the iOS Shortcut setup doc is registered in the in-app Docs viewer", async () => {
  const docsSource = await Deno.readTextFile(new URL("src/Docs.jsx", root));
  assert(docsSource.includes('"IOS_SHORTCUT_SETUP.md"'), "Docs.jsx must register IOS_SHORTCUT_SETUP.md");
  assert(docsSource.includes('slug: "ios-shortcut"'), "Docs.jsx must expose the ios-shortcut slug");

  const doc = await Deno.readTextFile(new URL("docs/IOS_SHORTCUT_SETUP.md", root));
  assert(doc.includes("https://magpiecapture.com/share?url="), "the Shortcut artifact must target the real /share endpoint with a url param");
  assert(doc.includes("URL Encode"), "the Shortcut setup must URL-encode the shared input before building the /share link");
  assert(doc.includes("Open URLs"), "the Shortcut setup must hand off to Safari via Open URLs, not a background HTTPS POST");
  assert(!doc.toLowerCase().includes("device verified"), "the doc must not claim device verification the app cannot actually perform");
});

Deno.test("the onboarding Method screen opens the iOS Shortcut doc, never claims desktop pairing as the mobile solution", async () => {
  const flow = await Deno.readTextFile(new URL("src/onboarding/OnboardingWelcomeFlow.jsx", root));
  assert(flow.includes("onOpenIosSetup"), "the iPhone card must be wired to open the Shortcut setup doc");
  assert(flow.includes("We can't detect your phone automatically"), "the iPhone/Android cards must not claim an unverified device state");
});

Deno.test("App.jsx opens the iOS Shortcut doc via the existing ?docs= deep link, not a new route", async () => {
  const app = await Deno.readTextFile(new URL("src/App.jsx", root));
  assert(app.includes('"/?docs=ios-shortcut"'), "opening the Shortcut doc must reuse the existing ?docs= pattern, not a new route that could collide with /share or /login");
});

Deno.test("the onboarding wizard reuses the existing authenticated mobile-capture path for its paste-URL fallback, not a new endpoint", async () => {
  const app = await Deno.readTextFile(new URL("src/App.jsx", root));
  assert(app.includes("onPasteCapture={submitMobileCapture}"), "paste-URL fallback must call the existing submitMobileCapture, not a parallel capture path");
});

Deno.test("a returning user can reopen the onboarding walkthrough on demand, without re-running the full first-run tour", async () => {
  const app = await Deno.readTextFile(new URL("src/App.jsx", root));
  assert(app.includes("setIsOnboardingTourOpen(true)"), "the topbar must expose a way to reopen onboarding guidance at any time");
  assert(app.includes('initialStep="pair"'), "reopening onboarding must not force a returning user back through Welcome/Project again");

  const flow = await Deno.readTextFile(new URL("src/onboarding/OnboardingWelcomeFlow.jsx", root));
  assert(flow.includes("STEP_ORDER"), "the wizard must support stepping backward, not just forward");
});
