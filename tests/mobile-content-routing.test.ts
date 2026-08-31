import { assert } from "jsr:@std/assert";

const root = new URL("../", import.meta.url);

Deno.test("a real device-capability check exists and is UA-based, not the old feature-detection false positive", async () => {
  const device = await Deno.readTextFile(new URL("src/lib/device.js", root));
  assert(device.includes("canInstallExtension"), "must export a canInstallExtension check");
  assert(/Android|iPhone|iPad/i.test(device), "must actually test the user agent for mobile OSes, not just feature-detect an API present on every modern browser");
});

Deno.test("CaptureSourceOffer branches on device instead of showing extension pairing as the only primary action", async () => {
  const source = await Deno.readTextFile(new URL("src/features/nest/CaptureSourceOffer.jsx", root));
  assert(source.includes('from "../../lib/device.js"'), "must use the shared device check, not invent a parallel one");
  assert(source.includes("canInstallExtension"), "must branch on the device check");
  assert(source.includes("Add Magpie to your home screen"), "mobile users need a primary action they can actually complete");
});

Deno.test("the capture guide is desktop-only (extension modes), since mobile no longer captures", async () => {
  const guide = await Deno.readTextFile(new URL("src/onboarding/CaptureGuideDialog.jsx", root));
  assert(guide.includes("GUIDE_STEPS"), "must select an active step list at render time");
  assert(guide.includes('label: "Clip Element"'), "must walk through the extension's real capture modes");
  assert(!guide.includes("MOBILE_STEPS") && !guide.includes("isIosShortcut"), "mobile capture guidance was retired -- capture happens only on the desktop extension now");
});

Deno.test("pairing dialogs are honest that pairing is cross-device, not phrased as same-device", async () => {
  const dialog = await Deno.readTextFile(new URL("src/features/pairing/PairingDialog.jsx", root));
  assert(dialog.toLowerCase().includes("on your computer"), "must say the extension only runs on a computer, regardless of which device generated the pairing");

  const management = await Deno.readTextFile(new URL("src/features/pairing/PairingManagementDialog.jsx", root));
  assert(management.toLowerCase().includes("on your computer"), "the connected-browsers empty state must carry the same cross-device honesty");
});

Deno.test("the killed onboarding wizard was not resurrected by this fix", async () => {
  const app = await Deno.readTextFile(new URL("src/App.jsx", root));
  assert(!app.includes("OnboardingWelcomeFlow"), "must not reintroduce the wizard retired per BUILD_GUIDE's 'do not create a second onboarding surface' decision");
  assert(!app.includes("OnboardingPanel"), "must not reintroduce the wizard's panel wrapper either");
});
