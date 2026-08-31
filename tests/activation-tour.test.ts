import { assert } from "jsr:@std/assert";

const root = new URL("../", import.meta.url);

Deno.test("the tour controller derives its floor step from OnboardingStage, not a parallel persisted pointer", async () => {
  const controller = await Deno.readTextFile(new URL("src/tour/useTourController.js", root));
  assert(controller.includes('from "../onboarding/state.js"'), "must key off the existing onboarding stage machine, not invent a new one");
  assert(controller.includes("OnboardingStage.AWAITING_FIRST_CAPTURE"), "must cover the awaiting-first-capture stage");
  assert(controller.includes("OnboardingStage.FIRST_CAPTURE_RECEIVED"), "must cover the first-capture-received stage");
  assert(controller.includes("floorIndex"), "real progress must only push the tour forward, never back");
});

Deno.test("activation tour has a welcome step before Get the extension, and points at the real anchors added to the dashboard", async () => {
  const steps = await Deno.readTextFile(new URL("src/tour/dashboardSteps.js", root));
  assert(/id:\s*"welcome"/.test(steps), "the tour must not start cold on Get the extension with no introduction");
  assert(steps.indexOf('"welcome"') < steps.indexOf('"get-extension"'), "welcome must come before get-extension in step order");
  assert(steps.includes('[data-tour="get-extension"]'));
  assert(steps.includes('[data-tour="pair-extension"]'));
  assert(steps.includes('[data-tour="record-grid"]'));

  const nav = await Deno.readTextFile(new URL("src/layout/AppNavigation.jsx", root));
  assert(nav.includes('data-tour="get-extension"'));
  assert(nav.includes('data-tour="pair-extension"'));

  const grid = await Deno.readTextFile(new URL("src/features/library/RecordCardGrid.jsx", root));
  assert(grid.includes('data-tour="record-grid"'));
});

Deno.test("the tour overlay uses driver.js's real steps/drive/moveTo API with visible controls, not the standalone highlight() method", async () => {
  const overlay = await Deno.readTextFile(new URL("src/tour/TourOverlay.jsx", root));
  assert(!overlay.includes(".highlight("), "highlight() silently forces showButtons to an empty array regardless of config -- must not be used");
  assert(overlay.includes("steps: steps.map"), "must build a real driver.js steps array (from a caller-supplied steps prop, shared with the mobile tour) so Back/Next/Done and their disabled states come from the library, not hand-rolled");
  assert(overlay.includes('showButtons: ["next", "previous", "close"]'), "close (x), back, and next must all be requested explicitly");
  assert(overlay.includes("allowClose: true"), "allowClose must be true or driver.js omits the close button even when requested in showButtons");
  assert(overlay.includes(".moveTo(floorIndex)"), "real progress (pairing, first capture) must be able to pull the user forward past wherever they manually browsed to");
  assert(overlay.includes("replayToken"), "there must be a way to restart the tour after it's been dismissed");
});

Deno.test("the desktop activation tour is disabled on mobile devices, not shown alongside the content-routing fix", async () => {
  const app = await Deno.readTextFile(new URL("src/App.jsx", root));
  assert(app.includes("useTourController"), "App.jsx must wire the tour controller");
  assert(app.includes("<TourOverlay"), "App.jsx must mount the tour overlay");
  assert(/tourDismissed\s*=\s*activationDismissed\s*\|\|\s*!canInstallExtension\(\)/.test(app), "the extension-pairing tour must not show on devices that cannot install a Chrome extension");
  assert(/mobileTourDismissed\s*=\s*orientationDismissed\s*\|\|\s*canInstallExtension\(\)/.test(app), "the mobile orientation tour must not show on devices that can install a Chrome extension");
});

Deno.test("the driver.js instance is created once per mount, not rebuilt on every App.jsx re-render", async () => {
  const overlay = await Deno.readTextFile(new URL("src/tour/TourOverlay.jsx", root));
  // App.jsx re-renders constantly (live subscriptions) and passes a fresh
  // dismissOnboarding reference each time. An effect keyed on that prop
  // directly would tear down and rebuild the whole instance almost every
  // render -- indistinguishable from the tour simply not working. The
  // mount effect must depend on nothing that changes across renders, and
  // read the current callback through a ref instead.
  const mountEffectMatch = overlay.match(/useEffect\(\(\) => \{\s*driverRef\.current = driver\(\{[\s\S]*?\}, (\[[^\]]*\])\);/);
  assert(mountEffectMatch, "could not locate the driver-instance-creation effect");
  assert(mountEffectMatch[1] === "[]", `the mount effect must have an empty dependency array, found ${mountEffectMatch[1]}`);
  assert(overlay.includes("onSkipRef.current = onSkip"), "the latest onSkip must be read via a ref, not closed over directly in the mount effect");
  assert(overlay.includes("onSkipRef.current()"), "callbacks inside the stable driver instance must call through the ref");
});

Deno.test("a capture stuck in Nest lands on its own honest step, not the 'filed automatically' one", async () => {
  const controller = await Deno.readTextFile(new URL("src/tour/useTourController.js", root));
  assert(controller.includes("CaptureOutcome.NEEDS_REVIEW"), "must branch on the real capture outcome, not just whether any clip exists");
  assert(controller.includes("FIRST_CAPTURE_NEEDS_REVIEW_STEP_INDEX"), "must have a distinct floor target for the needs_review outcome");

  const steps = await Deno.readTextFile(new URL("src/tour/dashboardSteps.js", root));
  assert(/id:\s*"first-capture-needs-review"/.test(steps), "there must be a step for the needs_review outcome");
  assert(steps.includes('requiresView: "nest"'), "the needs_review step must show on Nest, where the real decision lives, not Library");
  assert(!/first-capture-needs-review[\s\S]{0,300}filed itself automatically/i.test(steps), "must not claim automatic filing for a capture that is explicitly awaiting a manual decision");

  const app = await Deno.readTextFile(new URL("src/App.jsx", root));
  assert(app.includes("deriveCaptureOutcome(latestClip)"), "App.jsx must compute the real outcome of the most recent clip, not assume routing succeeded");
});

Deno.test("real install steps replace the fictional 'Chrome finishes installing' step, since Magpie is not on the Chrome Web Store", async () => {
  const steps = await Deno.readTextFile(new URL("src/tour/dashboardSteps.js", root));
  assert(!/id:\s*"waiting-install"/.test(steps), "there is no silent install moment to wait for with an unpacked extension -- must not imply one");
  assert(steps.includes("chrome://extensions"), "must give the real navigation target");
  assert(steps.includes("Developer mode"), "must mention the real required toggle");
  assert(steps.includes("Load unpacked"), "must mention the real load action, matching docs/GETTING_STARTED.md");
});

Deno.test("the tour pauses while any real app modal is open instead of blocking clicks on it", async () => {
  const app = await Deno.readTextFile(new URL("src/App.jsx", root));
  assert(app.includes("isAnyModalOpen"), "App.jsx must compute whether a real modal is open");
  assert(app.includes("paused={isAnyModalOpen}"), "the tour overlay must be paused while a modal is open");

  const overlay = await Deno.readTextFile(new URL("src/tour/TourOverlay.jsx", root));
  assert(overlay.includes("paused"), "the overlay must accept and act on a paused prop");
  assert(overlay.includes("lastActiveIndexRef"), "pausing must remember the step so resuming doesn't reset progress");
});

Deno.test("landing the first capture selects its actual Collection, not just the Library view in general", async () => {
  const app = await Deno.readTextFile(new URL("src/App.jsx", root));
  assert(app.includes("mostRecentClip(data.clips)"), "must look up the real capture that triggered this milestone");
  assert(app.includes("selectCollection(record.collection_id)"), "must land the user looking at the specific Collection their capture filed into, not an arbitrary one");
});

Deno.test("activation skip/completion and replay persist independent User-record progress", async () => {
  const app = await Deno.readTextFile(new URL("src/App.jsx", root));
  assert(app.includes("finishActivationTour(TourProgressStatus.SKIPPED)"), "Skip must persist an activation-specific skipped status");
  assert(app.includes("finishActivationTour(TourProgressStatus.COMPLETED)"), "Done must persist an activation-specific completed status");
  assert(app.includes("{ onboarding_dismissed: true }"), "desktop activation must retain the legacy dismissal write for existing static onboarding consumers");
  assert(app.includes("replayTour"), "there must be a way to un-dismiss and restart the tour");
  assert(app.includes("onboarding_dismissed: false"), "replay must reuse the same User-record field, not a parallel flag");
  assert(app.includes("activation: TourProgressStatus.NOT_STARTED"), "desktop replay must reset only activation progress");

  const nav = await Deno.readTextFile(new URL("src/layout/AppNavigation.jsx", root));
  assert(nav.includes("onReplayTour"), "the replay action must be reachable from the UI, not just exist in App.jsx");
});
