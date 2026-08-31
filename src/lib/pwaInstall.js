// Must be imported as early as possible (src/main.jsx, before the app
// renders) -- beforeinstallprompt only fires once per page load and is lost
// forever if nothing was listening yet when it did.
let deferredPrompt = null;
const installListeners = new Set();

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferredPrompt = event;
  });

  window.addEventListener("appinstalled", () => {
    deferredPrompt = null;
    installListeners.forEach((callback) => callback());
  });
}

export function canPromptInstall() {
  return !!deferredPrompt;
}

// Real, event-driven detection -- only ever available on Android/Chrome.
// iOS Safari never fires beforeinstallprompt at all; there is no
// programmatic install path there (Add to Home Screen is a manual Safari
// gesture, guided by AddToHomeScreenGuide.jsx).
export async function promptInstall() {
  if (!deferredPrompt) return false;
  deferredPrompt.prompt();
  const { outcome } = await deferredPrompt.userChoice;
  deferredPrompt = null;
  return outcome === "accepted";
}

export function onAppInstalled(callback) {
  installListeners.add(callback);
  return () => installListeners.delete(callback);
}

// Works identically on both platforms since it observes the *result* of
// installation (already running standalone), not the act of installing --
// the one signal that doesn't require beforeinstallprompt at all.
export function isStandalone() {
  if (typeof window === "undefined") return false;
  return window.matchMedia?.("(display-mode: standalone)").matches || window.navigator?.standalone === true;
}
