// Mobile is a read/organize surface -- capture happens on the desktop
// extension, not the phone. So the mobile first-run is an ORIENTATION tour:
// install as an app (optional, a real home-screen icon for reviewing on the
// go), then a walk around where things live -- Nest, Library, Signals,
// Search -- ending on how captures actually get in (the computer). No PWA
// phone-side capture handoff and no waiting for a capture to appear. `requiresView`
// drives navigation so each step actually shows the surface it describes.
export function buildMobileTourSteps(isIOSDevice) {
  return [
    {
      id: "welcome",
      selector: null,
      requiresView: "nest",
      title: "Welcome to Magpie",
      description: "Magpie turns web pages into organized, structured collections. Here's a 30-second tour of your workspace. Skip anytime with the × above.",
    },
    {
      id: "install",
      selector: '[data-tour="mobile-primary-action"]',
      requiresView: "nest",
      title: "Add Magpie to your home screen",
      // Optional, and honest about the one real catch on iOS: an installed
      // web app has its own login separate from Safari.
      description: isIOSDevice
        ? "Optional: tap the highlighted button to add Magpie to your home screen and open it full-screen, like a real app. One heads-up on iPhone — the installed app has its own sign-in, so you'll log in there once. Then click Next."
        : "Optional: tap the highlighted button to install Magpie and open it full-screen, like a real app. Then click Next.",
    },
    {
      id: "orient-nest",
      selector: '[data-tour="mobilenav-nest"]',
      requiresView: "nest",
      title: "Nest",
      description: "Nest holds only the captures that need one decision from you. Everything Magpie is confident about files itself and never stops here.",
    },
    {
      id: "orient-library",
      selector: '[data-tour="mobilenav-library"]',
      requiresView: "library",
      title: "Library — where your captures live",
      description: "This is where everything you capture appears, sorted into Collections automatically. It's the heart of your workspace — browse and organize it all from your phone.",
    },
    {
      id: "orient-signals",
      selector: '[data-tour="mobilenav-signals"]',
      requiresView: "signals",
      title: "Signals",
      description: "When you watch a source, Magpie rechecks it and tells you here what changed — a price, a status, a detail — without you re-visiting the page.",
    },
    {
      id: "orient-search",
      selector: '[data-tour="mobilenav-search"]',
      requiresView: "nest",
      title: "Search everything",
      description: "Find anything you've ever captured — by field value, captured text, or source — from one place.",
    },
    {
      // isTerminal: honest ending. Capture isn't a phone action, so the tour
      // closes by pointing at where captures come from rather than pretending
      // to wait for one to land (see TourOverlay.jsx for the Done handling).
      id: "capture-on-computer",
      selector: null,
      requiresView: "nest",
      isTerminal: true,
      title: "Capturing happens on your computer",
      description: "Install the Magpie extension on your computer's browser, then clip any page. It shows up in your Library here within seconds. Click Done to explore.",
    },
  ];
}

export function findMobileStepIndex(steps, id) {
  return steps.findIndex((step) => step.id === id);
}
