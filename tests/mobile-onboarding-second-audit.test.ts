import { assert } from "jsr:@std/assert";

const root = new URL("../", import.meta.url);

Deno.test("the first-run bare-root redirect never destroys a query string it didn't put there", async () => {
  // Confirmed live: a first-run account visiting a /?docs=... deep link got
  // silently rewritten to /nest before the Docs route could read the query.
  // Any other "/" deep link carrying its own query string was equally at
  // risk from the same effect.
  const app = await Deno.readTextFile(new URL("src/App.jsx", root));
  assert(
    /pathname === "\/" && !window\.location\.search\)/.test(app),
    "the bare-root-to-/nest redirect must require an empty query string, not just pathname === \"/\"",
  );
});

Deno.test("CaptureGuideDialog's first step offers a real, working exit instead of a disabled-looking Back", async () => {
  // Confirmed live: landing on step 1 (as the "Add Magpie to your home
  // screen" primary action does) showed a Back button styled identically to
  // Next, just dimmed -- disabled, not hidden, so it looked broken rather
  // than absent. Only the small header "x" actually worked, and testing
  // found real users don't reliably find it.
  const guide = await Deno.readTextFile(new URL("src/onboarding/CaptureGuideDialog.jsx", root));
  assert(
    !/disabled=\{stepIndex === 0\}/.test(guide),
    "step 0 must not render a disabled Back button",
  );
  assert(
    /stepIndex === 0[\s\S]{0,600}onClick=\{onClose\}/.test(guide),
    "step 0 must render a real Close action in Back's place, not just rely on the header icon",
  );
});

Deno.test("Android's install copy doesn't name one specific browser", async () => {
  // The beforeinstallprompt mechanism this button tries first also works in
  // Edge and Samsung Internet, not just Chrome -- calling out "Chrome"
  // specifically in user-facing copy was flagged as overly narrow.
  const mobileSteps = await Deno.readTextFile(new URL("src/tour/mobileSteps.js", root));
  const guide = await Deno.readTextFile(new URL("src/onboarding/CaptureGuideDialog.jsx", root));
  assert(!/description: "Tap the button below\. If Chrome offers/.test(mobileSteps), "tour copy must not hedge on one named browser");
  assert(!/Chrome installs it in one tap/.test(guide), "guide copy must not hedge on one named browser");
});

Deno.test("retired mobile capture copy is absent from active onboarding surfaces", async () => {
  const mobileSteps = await Deno.readTextFile(new URL("src/tour/mobileSteps.js", root));
  const guide = await Deno.readTextFile(new URL("src/onboarding/CaptureGuideDialog.jsx", root));
  const app = await Deno.readTextFile(new URL("src/App.jsx", root));
  for (const source of [mobileSteps, guide, app]) {
    assert(!/one-tap sharing|share into magpie|mobile-capture|magpie\.shortcut/i.test(source), "active onboarding must describe mobile as read/organize only");
  }
});
