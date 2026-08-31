import { assert } from "jsr:@std/assert";

const root = new URL("../", import.meta.url);

Deno.test("the retired onboarding wizard cannot reintroduce mobile capture", async () => {
  const app = await Deno.readTextFile(new URL("src/App.jsx", root));
  assert(!app.includes("OnboardingWelcomeFlow") && !app.includes("OnboardingPanel"), "the dead wizard must remain disconnected");
  await Deno.stat(new URL("src/onboarding/OnboardingWelcomeFlow.jsx", root))
    .then(() => assert(false, "the retired wizard source should be removed"))
    .catch((error) => assert(error instanceof Deno.errors.NotFound));
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
  assert(app.includes("base44.auth.updateMe(update)"), "dismissal and granular progress must persist through the SDK's owner-scoped updateMe");
  assert(app.includes("{ onboarding_dismissed: true }"), "desktop activation must keep updating the existing legacy field while progress migration is additive");
  assert(app.includes("onboarding_progress: nextProgress"), "granular activation/orientation state must live on the authenticated User record");
  assert(app.includes("user?.onboarding_dismissed"), "the stage machine must read dismissal from the real user object, not local state seeded from localStorage");
});
