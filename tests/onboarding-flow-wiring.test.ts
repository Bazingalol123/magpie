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
  assert(!flow.toLowerCase().includes("device verified"), "the phone card must not claim an unverified device state");
  assert(flow.includes("Set up mobile capture"), "the phone card must offer the real setup path");
});

Deno.test("App.jsx opens the iOS Shortcut doc via the existing ?docs= deep link, not a new route", async () => {
  const app = await Deno.readTextFile(new URL("src/App.jsx", root));
  assert(app.includes('"/?docs=ios-shortcut"'), "opening the Shortcut doc must reuse the existing ?docs= pattern, not a new route that could collide with /share or /login");
});

Deno.test("the Nest paste fallback reuses the existing authenticated mobile-capture path", async () => {
  const app = await Deno.readTextFile(new URL("src/App.jsx", root));
  assert(app.includes("onPaste={openMobileCapture}"), "empty Nest must open the existing capture dialog");
  assert(app.includes("<MobileCaptureDialog") && app.includes("onSubmit={submitMobileCapture}"), "paste-URL fallback must call the existing submitMobileCapture, not a parallel capture path");
});

Deno.test("capture guidance lives in Nest and opens a deliberate guided modal", async () => {
  const app = await Deno.readTextFile(new URL("src/App.jsx", root));
  const captureSourceOffer = await Deno.readTextFile(new URL("src/features/nest/CaptureSourceOffer.jsx", root));
  assert(captureSourceOffer.includes("function CaptureSourceOffer"), "the empty Nest must contain capture-source guidance");
  assert(app.includes("<PairingDialog"), "pairing must remain a deliberate modal");
  assert(app.includes("<CaptureGuideDialog"), "the first-run Nest must open the large capture guide on demand");
  assert(app.includes("onOpenGuide={() => setIsCaptureGuideOpen(true)}"), "the guide must be reachable from the real Nest state");
  assert(app.includes('onOpenOnboardingTour={() => { navigateWorkspace("nest"); setIsCaptureGuideOpen(true); }}'), "the empty Library CTA must open the same guide instead of adding another onboarding surface");
  assert(!app.includes("capture-mode-previews"), "the three tiny static mode previews must not remain in Nest");
});

Deno.test("capture guide is a bounded Back/Next walkthrough over real recordings", async () => {
  const guide = await Deno.readTextFile(new URL("src/onboarding/CaptureGuideDialog.jsx", root));
  assert(guide.includes("GUIDE_STEPS"));
  assert(guide.includes('label: "Clip Element"'));
  assert(guide.includes('label: "Snip Area"'));
  assert(guide.includes('label: "Save Page"'));
  assert(guide.includes('label: "What happens next"'));
  assert(guide.includes("> Back</button>"));
  assert(guide.includes("Next <ArrowRight"));
  assert(guide.includes("> Done</button>"));
  assert(guide.includes("capture-guide-outcome-preview"), "the outcome step must use the current UI-native workflow preview");
  assert(!guide.includes("/onboarding/first-value.png"), "the retired dashboard screenshot must not appear in the guide");
});

Deno.test("capture guide media keeps its native proportions and guide buttons have local sizing", async () => {
  const css = await Deno.readTextFile(new URL("src/index.css", root));
  assert(css.includes(".capture-guide-media img { width: auto; height: auto; max-width: 100%; max-height: 100%"), "recordings must not be stretched beyond their intrinsic dimensions");
  assert(css.includes(".capture-guide-footer > button { width: 108px; min-width: 108px; height: 40px"), "Back/Next/Done must not inherit full-width or 51px controls");
  assert(css.includes(".capture-guide-source-actions .primary-button, .capture-guide-source-actions .secondary-button, .capture-guide-source-actions .text-button"), "capture-source CTAs need one consistent local size rule");
});

Deno.test("an empty first-run account can explicitly open Library", async () => {
  const app = await Deno.readTextFile(new URL("src/App.jsx", root));
  assert(
    app.includes('isFirstRun && activeView === "library" && window.location.pathname === "/"'),
    "the first-run redirect must apply only at the bare root, not trap an empty account away from /library",
  );
  assert(
    app.includes('window.history.replaceState({}, "", "/nest")'),
    "the one-time root redirect must keep browser history and the rendered Nest in sync",
  );
  assert(
    app.includes('}, [activeView, isFirstRun, user]);'),
    "the redirect must re-evaluate after login changes the URL from /login to the bare root",
  );
});

Deno.test("onboarding dismissal is tracked on the User record, not a browser-local flag that leaks across accounts sharing a browser", async () => {
  const app = await Deno.readTextFile(new URL("src/App.jsx", root));
  assert(!app.includes("magpie.onboarding.dismissed"), "must not read/write the old localStorage flag -- it leaked a previous account's dismissal onto a brand-new signup in the same browser");
  assert(app.includes("base44.auth.updateMe({ onboarding_dismissed: true })"), "dismissal must persist to the authenticated user's own record via the SDK's owner-scoped updateMe");
  assert(app.includes("user?.onboarding_dismissed"), "the stage machine must read dismissal from the real user object, not local state seeded from localStorage");
});
