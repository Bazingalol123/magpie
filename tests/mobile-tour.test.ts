import { assert } from "jsr:@std/assert";

const root = new URL("../", import.meta.url);

Deno.test("beforeinstallprompt is captured as early as possible, before it can be lost", async () => {
  const main = await Deno.readTextFile(new URL("src/main.jsx", root));
  assert(main.includes('import \'@/lib/pwaInstall.js\''), "pwaInstall.js must be imported at the very top of the entry point -- beforeinstallprompt fires once per page load and is lost forever if nothing is listening yet");

  const pwaInstall = await Deno.readTextFile(new URL("src/lib/pwaInstall.js", root));
  assert(pwaInstall.includes('addEventListener("beforeinstallprompt"'), "must capture the real install prompt event");
  assert(pwaInstall.includes("event.preventDefault()"), "must prevent the default mini-infobar so the app controls when to show the real prompt");
  assert(pwaInstall.includes('addEventListener("appinstalled"'), "must detect real Android/Chrome install completion");
  assert(pwaInstall.includes("isStandalone"), "must also expose the platform-agnostic standalone-mode check for iOS, where beforeinstallprompt never fires");
});

Deno.test("the mobile tour is an orientation walk (Nest/Library/Signals/Search), not a capture-activation flow", async () => {
  const steps = await Deno.readTextFile(new URL("src/tour/mobileSteps.js", root));
  // Orientation steps that show where things live.
  assert(steps.includes('id: "orient-nest"') && steps.includes('id: "orient-library"') && steps.includes('id: "orient-signals"') && steps.includes('id: "orient-search"'), "must walk Nest -> Library -> Signals -> Search");
  assert(steps.includes('id: "capture-on-computer"') && steps.includes("isTerminal: true"), "must end by pointing at where capture actually happens (the computer), not waiting for a phone capture");
  // No retired capture/share/shortcut steps.
  assert(!steps.includes("Shortcut") && !steps.includes("share-into-magpie") && !steps.includes("first-capture-needs-review"), "mobile capture/share/shortcut was retired -- the mobile tour must not reference it");
  // The install-as-app step is kept, and is honest about iOS's separate session.
  assert(steps.includes('[data-tour="mobile-primary-action"]'), "the optional install step must anchor to the real home-screen button");
  assert(steps.includes("isIOSDevice"), "the install copy must note iOS's separate sign-in only where it applies");

  const offer = await Deno.readTextFile(new URL("src/features/nest/CaptureSourceOffer.jsx", root));
  assert(offer.includes("canPromptInstall") && offer.includes("promptInstall"), "Android should still get the real native install prompt when available");
});

Deno.test("the orientation tour navigates to each surface it describes, via TourOverlay's per-step hook", async () => {
  const overlay = await Deno.readTextFile(new URL("src/tour/TourOverlay.jsx", root));
  assert(overlay.includes("onStepView") && overlay.includes("onHighlightStarted"), "TourOverlay must fire a per-step callback so the tour can navigate to each surface");

  const app = await Deno.readTextFile(new URL("src/App.jsx", root));
  assert(/onStepView=\{\(step\) => \{ if \(step\.requiresView\) navigateWorkspace\(step\.requiresView\)/.test(app), "the mobile tour must navigate to each step's requiresView so it actually shows Library, Signals, etc.");

  const controller = await Deno.readTextFile(new URL("src/tour/useMobileTourController.js", root));
  assert(!controller.includes("CaptureOutcome") && !controller.includes("onAppInstalled"), "the orientation controller has no capture-outcome floor -- it's a plain linear walk");
  assert(controller.includes("orientationStep") && controller.includes("TourProgressStatus.IN_PROGRESS"), "an interrupted orientation must resume from the per-user saved step");
});

Deno.test("TourOverlay is shared between desktop and mobile via a steps prop, and App.jsx mounts both gated to the right platform", async () => {
  const overlay = await Deno.readTextFile(new URL("src/tour/TourOverlay.jsx", root));
  assert(!overlay.includes('from "./dashboardSteps.js"'), "TourOverlay must not hardcode the desktop step set -- it has to serve the mobile tour too");

  const app = await Deno.readTextFile(new URL("src/App.jsx", root));
  assert(app.includes("useMobileTourController"), "App.jsx must wire the mobile tour controller");
  assert(app.includes("steps={ACTIVATION_STEPS}"), "the desktop overlay instance must use the desktop step set");
  assert(app.includes("steps={mobileTourSteps}"), "the mobile overlay instance must use the mobile step set");
});

Deno.test("landing a first capture selects the right Collection (desktop path; unaffected by retiring mobile capture)", async () => {
  const app = await Deno.readTextFile(new URL("src/App.jsx", root));
  assert(app.includes("onboardingStage !== OnboardingStage.FIRST_CAPTURE_RECEIVED"), "must key off the real onboarding stage directly");
  assert(app.includes("latestCaptureOutcome === CaptureOutcome.NEEDS_REVIEW"), "must not navigate to a Collection for a capture that has none yet");
});
