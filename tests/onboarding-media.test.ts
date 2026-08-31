import { assert } from "jsr:@std/assert@1";

const root = new URL("../", import.meta.url);

Deno.test("the onboarding walkthrough assets are real, non-empty files, not placeholders", async () => {
  for (const asset of [
    "public/onboarding/desktop-capture.gif",
    "public/onboarding/mode-element.gif",
    "public/onboarding/mode-snip.gif",
  ]) {
    const bytes = await Deno.readFile(new URL(asset, root));
    assert(bytes.length > 1000, `${asset} is missing or suspiciously small (${bytes.length} bytes)`);
  }
});

Deno.test("the desktop capture guide keeps the real extension recordings", async () => {
  const guide = await Deno.readTextFile(new URL("src/onboarding/CaptureGuideDialog.jsx", root));
  assert(guide.includes('"/onboarding/mode-element.gif"'), "the guide must reference the recorded element-picker walkthrough");
  assert(guide.includes('"/onboarding/mode-snip.gif"'), "the guide must reference the recorded snip walkthrough");
  assert(guide.includes('"/onboarding/desktop-capture.gif"'), "the guide must reference the recorded page-save walkthrough");
});

Deno.test("the capture guide contains only extension modes and one real exit", async () => {
  const guide = await Deno.readTextFile(new URL("src/onboarding/CaptureGuideDialog.jsx", root));
  assert(guide.includes('label: "Clip Element"') && guide.includes('label: "Snip Area"') && guide.includes('label: "Save Page"'));
  assert(guide.includes('label: "What happens next"'), "the guide must explain the real routing outcome after capture");
  assert(!/paste a link|iphone|shortcut|mobile capture/i.test(guide), "the desktop guide must stay extension-only");
  assert(guide.includes("onClick={onClose}"), "the guide must always provide a real close path");
});
