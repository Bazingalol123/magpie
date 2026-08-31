import { useMemo } from "react";
import { isIOS } from "../lib/device.js";
import { buildMobileTourSteps } from "./mobileSteps.js";

// Mobile is orientation-only now (capture moved off the phone), so there's
// no capture-progress floor to compute the way the desktop activation tour
// has -- it's a plain linear walk that always starts at Welcome. Per-step
// view navigation is handled by TourOverlay's onStepView, not here.
export function useMobileTourController() {
  const steps = useMemo(() => buildMobileTourSteps(isIOS()), []);
  return { steps, floorIndex: 0 };
}
