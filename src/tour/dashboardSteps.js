// Content only -- no state logic here. useTourController.js/TourOverlay.jsx
// decide which index is active from real app state; this file just says
// what each step looks like, in a fixed linear order. `selector` is a
// data-tour hook added in AppNavigation.jsx/RecordCardGrid.jsx; a null
// selector means a floating popover with no spotlighted element.
export const ACTIVATION_STEPS = [
  {
    id: "welcome",
    selector: null,
    title: "Welcome to Magpie",
    description: "This quick tour gets you from nothing to your first organized capture. Skip anytime with the × above.",
  },
  {
    // Magpie isn't on the Chrome Web Store -- it loads as an unpacked
    // extension. There's no silent "Chrome finishes installing" moment to
    // wait for, so this step spells out the real, manual steps instead of
    // pretending there's an automatic one (docs/GETTING_STARTED.md is the
    // source of truth this mirrors).
    id: "get-extension",
    selector: '[data-tour="get-extension"]',
    title: "Download the extension",
    description: "<ol style=\"margin:0 0 8px;padding-left:18px;\">"
      + "<li>Click here to download the zip, then unzip it.</li>"
      + "<li>In Chrome, open <code>chrome://extensions</code>.</li>"
      + "<li>Turn on <b>Developer mode</b> (top-right toggle).</li>"
      + "<li>Click <b>Load unpacked</b> and select the unzipped <code>extension</code> folder.</li>"
      + "</ol>Then click Next.",
  },
  {
    id: "pair-extension",
    selector: '[data-tour="pair-extension"]',
    title: "Pair the extension",
    description: "Click here, then click the Magpie icon in your Chrome toolbar to open its side panel. Copy the two values into it, then paste — pairing finishes on its own once the extension uses them.",
  },
  {
    // Next is deliberately disabled here (see TourOverlay.jsx) -- the two
    // steps after this one are real outcome claims ("filed itself" /
    // "waiting in Nest"), and letting a user manually click through to them
    // before actually capturing anything means the tour lies to them. This
    // step only ever advances for real, once a capture really lands.
    id: "run-first-capture",
    selector: null,
    disableNext: true,
    title: "Try your first capture",
    description: "In the side panel: hover any element on a page and press <b>C</b> to clip it, or use Snip area / Save page instead. This tour picks up automatically once something lands.",
  },
  {
    // Only reachable when the capture was confident enough to route itself
    // (routing_status routed_existing/created_collection). A capture stuck
    // in Nest never becomes a Record at all -- that's the whole point of
    // Nest -- so this step must not claim "filed automatically" for one.
    //
    // isTerminal (see TourOverlay.jsx): this and first-capture-needs-review
    // are mutually exclusive alternate endings for the same milestone, not
    // sequential steps -- without this flag, driver.js sees a "next" step
    // array-wise and shows Next instead of Done, and clicking it falsely
    // claims the OTHER outcome (confirmed by testing: a real successful
    // capture's "There it is" showed Next, and clicking it claimed the
    // capture was "waiting in Nest" when nothing was).
    id: "first-record",
    selector: '[data-tour="record-grid"]',
    requiresView: "library",
    isTerminal: true,
    title: "There it is",
    description: "Magpie filed your first capture into this Collection automatically. Click Done to keep exploring — guided tours for Signals, Search, and Watches are coming soon.",
    waitForElement: 4000,
  },
  {
    // The needs_review counterpart of first-record -- same milestone (a
    // real first capture happened), different real outcome, so it needs
    // its own honest content and its own view (Nest, not Library).
    id: "first-capture-needs-review",
    selector: '[data-tour="nav-nest"]',
    requiresView: "nest",
    isTerminal: true,
    title: "One quick decision",
    description: "Magpie wasn't confident how to file this one, so it's waiting right here in Nest for your call. Confident captures go straight to a Collection automatically — most will, once Magpie has seen a few like it.",
  },
];

export const FIRST_RECORD_STEP_INDEX = ACTIVATION_STEPS.findIndex((step) => step.id === "first-record");
export const FIRST_CAPTURE_NEEDS_REVIEW_STEP_INDEX = ACTIVATION_STEPS.findIndex((step) => step.id === "first-capture-needs-review");
