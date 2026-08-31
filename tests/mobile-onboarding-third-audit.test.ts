import { assert } from "jsr:@std/assert";

const root = new URL("../", import.meta.url);

Deno.test("the iOS 'Add to home screen' button opens a focused how-to, never a silent no-op or the unrelated capture-guide carousel", async () => {
  // Confirmed on a real iPhone: the primary button labeled "Add Magpie to
  // your home screen" opened the multi-step capture-guide carousel (since
  // iOS has no beforeinstallprompt to fire), which read as broken -- the
  // button didn't do what it said. It must instead open a dedicated,
  // focused install how-to.
  const offer = await Deno.readTextFile(new URL("src/features/nest/CaptureSourceOffer.jsx", root));
  assert(offer.includes("onShowInstallHelp"), "the primary action needs a dedicated install-help handler prop");
  assert(offer.includes("onShowInstallHelp()"), "the no-native-prompt fallback (always the case on iOS) must open install help");
  const normalized = offer.replace(/\s+/g, " ");
  assert(
    !/if \(accepted\) return; \} onOpenGuide\(\);/.test(normalized),
    "the primary mobile action must NOT fall back to the capture-guide carousel (onOpenGuide) anymore",
  );

  const guide = await Deno.readTextFile(new URL("src/onboarding/AddToHomeScreenGuide.jsx", root));
  assert(guide.includes("isIOS()"), "the how-to must branch its real steps on the actual OS");
  assert(guide.includes("Add to Home Screen"), "the iOS branch must name Safari's real Add to Home Screen action");
});

Deno.test("the iOS install tour tooltip says to tap the highlighted button, and no longer recites Safari's own Share steps (the source of the 'pointing at a useless button' confusion)", async () => {
  const steps = await Deno.readTextFile(new URL("src/tour/mobileSteps.js", root));
  assert(/tap the highlighted button/i.test(steps), "the tooltip's instruction must be to tap the spotlighted in-app button");
  assert(
    !/Tap the <b>Share<\/b> button in Safari/.test(steps),
    "the Safari Share recitation must live in the how-to dialog, not in a tour tooltip that spotlights an in-page button",
  );
});

Deno.test("the install-help dialog pauses the live tour like every other modal", async () => {
  const app = await Deno.readTextFile(new URL("src/App.jsx", root));
  assert(app.includes("isInstallHelpOpen"), "install-help open state must exist");
  assert(app.includes("AddToHomeScreenGuide"), "the dialog must be mounted");
  assert(/isAnyModalOpen = [\s\S]{0,600}isInstallHelpOpen/.test(app), "install help must be part of isAnyModalOpen so the tour releases pointer-events while it's open");
});

Deno.test("the dev/preview api proxy can't be crashed by a client aborting a slow request", async () => {
  // Confirmed from a real iPhone: opening the installed PWA crashed the Vite
  // dev server with an unhandled ECONNRESET ("Frontend dev server exited
  // with code 1"), leaving the owner unable to log in at all. A proxy error
  // handler keeps the server alive when a phone resets a proxied /api
  // request mid-flight; the preview (production-build) server is the robust
  // path for real-device testing since it has no HMR websocket to reset.
  const config = await Deno.readTextFile(new URL("vite.config.js", root));
  assert(config.includes("proxy.on('error'"), "the /api proxy must swallow errors so a client reset can't take down the whole server");
  assert(/preview:\s*\{/.test(config), "a preview server (production build) must be configured for robust device testing");
  assert(config.includes("MAGPIE_BACKEND_URL"), "the backend target must be overridable, since base44 dev picks its port non-deterministically");
});
