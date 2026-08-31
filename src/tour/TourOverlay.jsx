import { useEffect, useRef } from "react";
import { driver } from "driver.js";
import "driver.js/dist/driver.css";

// The popover's position is computed once, against the layout at that
// instant. If anything reflows shortly after (fonts, images, the sidebar
// re-rendering with real data instead of a loading state), driver.js has no
// way to know unless something calls .refresh() or its own window "resize"
// listener fires -- confirmed on the extension's Side Panel, where a font
// swap left the popover stuck in the wrong place until a manual resize.
// Applying the same safety net here defensively.
function scheduleRefresh(instance) {
  requestAnimationFrame(() => requestAnimationFrame(() => instance?.refresh()));
  document.fonts?.ready?.then(() => instance?.refresh());
}

// Built on driver.js's real steps/drive()/moveTo() API, not the standalone
// highlight() method -- highlight() silently forces showButtons to an empty
// array regardless of the driver instance's config (confirmed in driver.js's
// own source), which is why an earlier version of this file had no visible
// close/back/next controls at all. The steps API reads the global config
// correctly and gives Back/Next/Done for free, including the right
// disabled-on-first-step / Done-on-last-step behavior.
export default function TourOverlay({ steps, floorIndex, dismissed, paused, onSkip, replayToken, skipFirstStepWhen, skipFirstStepTarget, onStepView }) {
  const driverRef = useRef(null);
  const lastActiveIndexRef = useRef(0);
  // Per-step side effect fired when a step is highlighted -- the orientation
  // tour uses it to navigate to the surface each step describes (Nest ->
  // Library -> Signals -> ...). Read via a ref so the instance is still
  // built once. The activation tour doesn't pass it, so its behavior is
  // unchanged.
  const onStepViewRef = useRef(onStepView);
  onStepViewRef.current = onStepView;
  // App.jsx re-renders constantly (live entity subscriptions, debounced
  // reloads every ~400ms) and passes a brand-new dismissOnboarding function
  // reference each time -- a naive [onSkip] effect dependency would tear
  // down and rebuild the whole driver.js instance on nearly every render,
  // which is indistinguishable from "the tour doesn't work" (it flashes in,
  // then gets replaced by a fresh, un-driven instance almost immediately).
  // Read the latest callback through a ref instead, so the instance below
  // is created exactly once for this component's lifetime.
  const onSkipRef = useRef(onSkip);
  onSkipRef.current = onSkip;
  // Whether step 0's Next should jump straight to skipFirstStepTarget --
  // read via a ref (not baked into the steps array at mount time) so it can
  // still change later without rebuilding the instance. This never skips
  // step 0 itself: a brand-new account always sees the intro at least once,
  // it only affects what happens when THEY click Next from it.
  const skipFirstStepWhenRef = useRef(skipFirstStepWhen);
  skipFirstStepWhenRef.current = skipFirstStepWhen;

  useEffect(() => {
    driverRef.current = driver({
      animate: true,
      allowClose: true,
      overlayClickBehavior: "close",
      overlayColor: "#16261b",
      overlayOpacity: 0.55,
      showButtons: ["next", "previous", "close"],
      stagePadding: 6,
      stageRadius: 8,
      popoverClass: "magpie-tour-popover",
      steps: steps.map((step, index) => ({
        element: step.selector || undefined,
        ...(step.waitForElement ? { waitForElement: step.waitForElement } : {}),
        onHighlightStarted: () => onStepViewRef.current?.(step),
        popover: {
          title: step.title,
          description: step.description,
          ...(step.disableNext ? { disableButtons: ["next"] } : {}),
          // isTerminal: this and any other terminal step are mutually
          // exclusive alternate endings for the same milestone, not a
          // sequence -- without this, driver.js sees a later array index
          // and shows "Next" (which, if clicked, falsely claims whichever
          // OTHER outcome comes next). Forcing "Done" here regardless of
          // array position is what actually makes that true.
          ...(step.isTerminal ? { nextBtnText: "Done", onNextClick: () => onSkipRef.current() } : {}),
          ...(index === 0 && skipFirstStepTarget != null
            ? {
                onNextClick: () => {
                  if (skipFirstStepWhenRef.current) driverRef.current.moveTo(skipFirstStepTarget);
                  else driverRef.current.moveNext();
                },
              }
            : {}),
        },
      })),
      onCloseClick: () => onSkipRef.current(),
      onDoneClick: () => onSkipRef.current(),
      onPopoverRender: (popoverDom) => {
        const skip = document.createElement("button");
        skip.type = "button";
        skip.className = "tour-skip-link";
        skip.textContent = "Skip tour";
        skip.onclick = () => onSkipRef.current();
        popoverDom.footer.insertBefore(skip, popoverDom.footer.firstChild);
      },
    });
    return () => {
      driverRef.current?.destroy();
      driverRef.current = null;
    };
  }, []);

  // iOS Safari's chrome (its collapsible address/toolbar) can change how
  // much of the screen is actually visible without firing a plain "resize"
  // -- window.innerHeight is known to lag the true visible area right after
  // a fresh page load in Safari, which driver.js's own position math has no
  // way to detect on its own. window.visualViewport tracks the real visible
  // area directly. NOTE: this is a defensive fix for a real report (a tour
  // popover's Next/Previous sat behind Safari's own bar on a real iPhone) --
  // it could not be visually reproduced in Chromium-based emulation, so it
  // needs re-verifying on a real device, not just trusting this code exists.
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return undefined;
    const onViewportChange = () => scheduleRefresh(driverRef.current);
    vv.addEventListener("resize", onViewportChange);
    vv.addEventListener("scroll", onViewportChange);
    return () => {
      vv.removeEventListener("resize", onViewportChange);
      vv.removeEventListener("scroll", onViewportChange);
    };
  }, []);

  useEffect(() => {
    const instance = driverRef.current;
    if (!instance) return;
    if (dismissed) {
      instance.destroy();
      return;
    }
    if (paused) {
      // driver.js sets pointer-events:none on the entire page except
      // whatever it's currently highlighting -- a real app modal (pairing,
      // capture guide, record detail...) opened while the tour is active
      // would render on top but be completely unclickable underneath that
      // rule. Fully releasing the tour while a modal is open, and resuming
      // at the same step rather than the floor, is the fix -- confirmed via
      // driver.js's own CSS, not a z-index guess.
      if (instance.isActive()) {
        lastActiveIndexRef.current = instance.getActiveIndex() ?? floorIndex;
        instance.destroy();
      }
      return;
    }
    if (!instance.isActive()) {
      instance.drive(Math.max(floorIndex, lastActiveIndexRef.current));
      scheduleRefresh(instance);
      return;
    }
    const activeIndex = instance.getActiveIndex() ?? 0;
    if (floorIndex > activeIndex) {
      instance.moveTo(floorIndex);
      scheduleRefresh(instance);
    }
  }, [floorIndex, dismissed, paused]);

  useEffect(() => {
    if (!replayToken) return;
    driverRef.current?.drive(0);
    scheduleRefresh(driverRef.current);
  }, [replayToken]);

  return null;
}
