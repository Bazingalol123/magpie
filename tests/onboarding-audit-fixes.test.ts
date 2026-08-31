import { assert } from "jsr:@std/assert";

const root = new URL("../", import.meta.url);

Deno.test("a brand-new account always sees Welcome, even if the extension is already detected installed", async () => {
  const controller = await Deno.readTextFile(new URL("src/tour/useTourController.js", root));
  assert(
    !/extensionDetected\)\s*return PAIR_EXTENSION_INDEX/.test(controller),
    "floorIndex must never jump past Welcome just because the extension is already detected -- confirmed by testing a real fresh signup that skipped straight to Pair the extension with zero introduction",
  );
  assert(controller.includes("skipToIndexFromStep0"), "the skip-ahead behavior must be exposed for step 0's own Next click to use instead, not baked into the floor");

  const overlay = await Deno.readTextFile(new URL("src/tour/TourOverlay.jsx", root));
  assert(overlay.includes("skipFirstStepWhenRef"), "the skip must be read via a ref on step 0's onNextClick, not applied by jumping the floor");
});

Deno.test("isFirstRun reflects having zero captures, not pairing status", async () => {
  const app = await Deno.readTextFile(new URL("src/App.jsx", root));
  assert(
    !/isFirstRun = onboardingStage === OnboardingStage\.NOT_PAIRED/.test(app),
    "isFirstRun must not require NOT_PAIRED -- a user who just paired but hasn't captured anything is still first-run, and gating on stage showed the wrong 'all caught up' empty state (confirmed by testing a real pairing)",
  );
  assert(/isFirstRun = data\.collections\.length === 0/.test(app), "isFirstRun must be based on real emptiness only");
});

Deno.test("the desktop activation tour disables manual Next before its outcome claim, so it can't lie about a capture that hasn't happened", async () => {
  const dashboardSteps = await Deno.readTextFile(new URL("src/tour/dashboardSteps.js", root));
  assert(/id:\s*"run-first-capture"[\s\S]{0,50}disableNext:\s*true/.test(dashboardSteps), "run-first-capture must disable manual Next");

  const overlay = await Deno.readTextFile(new URL("src/tour/TourOverlay.jsx", root));
  assert(overlay.includes("step.disableNext"), "TourOverlay must actually apply disableNext to driver.js's disableButtons");
  assert(overlay.includes('disableButtons: ["next"]'), "must disable specifically the next button, not previous/close");
});

Deno.test("terminal steps show Done (not Next) regardless of array position: desktop's two outcome endings and the mobile orientation ending", async () => {
  const dashboardSteps = await Deno.readTextFile(new URL("src/tour/dashboardSteps.js", root));
  assert(/id:\s*"first-record"[\s\S]{0,120}isTerminal:\s*true/.test(dashboardSteps), "first-record must be marked terminal");
  assert(/id:\s*"first-capture-needs-review"[\s\S]{0,80}isTerminal:\s*true/.test(dashboardSteps), "first-capture-needs-review must be marked terminal");

  const mobileSteps = await Deno.readTextFile(new URL("src/tour/mobileSteps.js", root));
  assert(/id:\s*"capture-on-computer"[\s\S]{0,160}isTerminal:\s*true/.test(mobileSteps), "the mobile orientation tour's ending must be terminal (Done, not Next)");

  const overlay = await Deno.readTextFile(new URL("src/tour/TourOverlay.jsx", root));
  assert(overlay.includes("step.isTerminal"), "TourOverlay must actually act on isTerminal");
  assert(overlay.includes('nextBtnText: "Done"'), "a terminal step must show Done regardless of its array position");
  assert(
    /isTerminal \? \{ nextBtnText: "Done", onNextClick: \(\) => onCompleteRef\.current\(\) \}/.test(overlay),
    "a terminal step's Next/Done must complete the tour, not skip or advance into whichever OTHER step happens to be next in the array",
  );
});
