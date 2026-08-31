import { useEffect, useMemo, useState } from "react";
import { OnboardingStage, CaptureOutcome } from "../onboarding/state.js";
import { isExtensionInstalled, onExtensionInstalled } from "../lib/device.js";
import { ACTIVATION_STEPS, FIRST_RECORD_STEP_INDEX, FIRST_CAPTURE_NEEDS_REVIEW_STEP_INDEX } from "./dashboardSteps.js";

const RUN_FIRST_CAPTURE_INDEX = ACTIVATION_STEPS.findIndex((step) => step.id === "run-first-capture");
const PAIR_EXTENSION_INDEX = ACTIVATION_STEPS.findIndex((step) => step.id === "pair-extension");

// No persisted step pointer: "how far the user has manually browsed" lives
// only inside the driver.js instance itself (TourOverlay), which resets on
// reload same as everything else here. The one thing derived from real data
// is `floorIndex` -- the step real progress has already reached. Real
// progress can only push the tour forward (pairing succeeding, a first
// capture landing), never back; free Back/Next browsing below the floor is
// just reading the steps, not a source of truth for anything.
export function useTourController({ onboardingStage, dismissed, activeView, captureOutcome, onNavigateToView }) {
  // extension/content.js marks the page directly once it's injected, which
  // happens on any reload/navigation after install -- no need to poll, and
  // no extension ID lookup required (unpacked installs don't have a stable
  // one across machines, unlike a Chrome Web Store extension).
  const [extensionDetected, setExtensionDetected] = useState(isExtensionInstalled);
  useEffect(() => {
    if (extensionDetected) return undefined;
    return onExtensionInstalled(() => setExtensionDetected(true));
  }, [extensionDetected]);

  // extensionDetected does NOT jump the floor -- that previously skipped
  // "Welcome" itself for any brand-new account that happened to already
  // have the extension installed (a real bug, found by testing a fresh
  // signup). It only ever affects step 0's own Next click, in TourOverlay,
  // so a new user always sees the intro at least once.
  const floorIndex = useMemo(() => {
    if (onboardingStage === OnboardingStage.FIRST_CAPTURE_RECEIVED) {
      // clips.length > 0 covers ANY capture, including one still sitting in
      // Nest awaiting a decision -- that one never becomes a Record, so it
      // must not land on the "filed automatically" step at all.
      return captureOutcome === CaptureOutcome.NEEDS_REVIEW ? FIRST_CAPTURE_NEEDS_REVIEW_STEP_INDEX : FIRST_RECORD_STEP_INDEX;
    }
    if (onboardingStage === OnboardingStage.AWAITING_FIRST_CAPTURE) return RUN_FIRST_CAPTURE_INDEX;
    return 0;
  }, [onboardingStage, captureOutcome]);

  useEffect(() => {
    const requiredView = ACTIVATION_STEPS[floorIndex]?.requiresView;
    if (dismissed || !requiredView || activeView === requiredView) return;
    // Some steps' anchors only exist on a specific view (the record grid on
    // Library, the Nest nav item's context on Nest) -- take the user there
    // instead of letting the spotlight wait out a timeout on the wrong screen.
    onNavigateToView?.(requiredView);
  }, [dismissed, floorIndex, activeView, onNavigateToView]);

  return { floorIndex, extensionDetected, skipToIndexFromStep0: PAIR_EXTENSION_INDEX };
}
