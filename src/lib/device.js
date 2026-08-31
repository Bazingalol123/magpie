// A Chrome extension only installs on desktop browsers. This is a binary
// mobile-vs-desktop capability check, not OS-flavored sniffing -- callers
// that need to distinguish Android from iOS specifically (different real
// capture mechanisms: Web Share Target vs. a user-built Shortcut) do that
// separately, close to where it actually matters.
export function canInstallExtension() {
  if (typeof navigator === "undefined") return true;
  return !/Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
}

// Set by extension/content.js, which is already injected into this page
// (its manifest matches all http(s) URLs, including the dashboard's own
// origin) -- gated there to Magpie's own origins only, so this only ever
// reflects Magpie's own extension on Magpie's own site, never a signal
// readable by or set from any other page.
export function isExtensionInstalled() {
  return typeof document !== "undefined" && document.documentElement.hasAttribute("data-magpie-extension");
}

export function onExtensionInstalled(callback) {
  if (isExtensionInstalled()) {
    callback();
    return () => {};
  }
  const handler = () => callback();
  window.addEventListener("magpie:extension-present", handler, { once: true });
  return () => window.removeEventListener("magpie:extension-present", handler);
}

// A real functional split, not sniffing for its own sake: iOS and Android
// expose different browser-native Add to Home Screen instructions, so the
// focused install guide needs to distinguish them.
export function isIOS() {
  if (typeof navigator === "undefined") return false;
  return /iPhone|iPad|iPod/i.test(navigator.userAgent);
}
