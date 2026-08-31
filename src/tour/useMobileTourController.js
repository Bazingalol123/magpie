import { useMemo } from "react";
import { isIOS } from "../lib/device.js";
import { buildMobileTourSteps } from "./mobileSteps.js";
import { TourProgressStatus } from "./onboardingProgress.js";

// Mobile is orientation-only now (capture moved off the phone), so there's
// no capture-progress floor to compute the way the desktop activation tour
// has -- it's a plain linear walk that always starts at Welcome. Per-step
// view navigation is handled by TourOverlay's onStepView, not here.
export function useMobileTourController(onboardingProgress) {
  const steps = useMemo(() => buildMobileTourSteps(isIOS()), []);
  const savedStep = onboardingProgress?.orientation === TourProgressStatus.IN_PROGRESS
    ? onboardingProgress.orientationStep
    : 0;
  const floorIndex = Math.min(Math.max(savedStep || 0, 0), steps.length - 1);
  return { steps, floorIndex };
}
