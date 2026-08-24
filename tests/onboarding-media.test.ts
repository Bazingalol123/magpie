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

Deno.test("the one-task capture-source flow keeps the real extension recordings", async () => {
  const flow = await Deno.readTextFile(new URL("src/onboarding/OnboardingWelcomeFlow.jsx", root));
  assert(flow.includes('"/onboarding/mode-element.gif"'), "the Modes carousel must reference the recorded element-picker walkthrough");
  assert(flow.includes('"/onboarding/mode-snip.gif"'), "the Modes carousel must reference the recorded snip walkthrough");
  assert(flow.includes('"/onboarding/desktop-capture.gif"'), "the Modes carousel must reference the recorded page-save walkthrough");
  assert(flow.includes("Connect the place you capture from"), "the flow must present one setup task");
  assert(!flow.includes("STEP_ORDER"), "the seven-step wizard must be gone");
});

Deno.test("illustrative preview steps were removed instead of presenting fixture data", async () => {
  const flow = await Deno.readTextFile(new URL("src/onboarding/OnboardingWelcomeFlow.jsx", root));
  assert(!flow.includes("CollectionsPreviewStep"), "the Collection preview step must be deleted");
  assert(!flow.includes("AgentPreviewStep"), "the Agent preview step must be deleted");
  assert(!flow.includes("SyncPreviewStep"), "the Sync preview step must be deleted");
  assert(!flow.includes("onboarding-mock-badge"), "fixture preview badges have no place in the real one-task flow");
});

Deno.test("the three capture modes render as a same-size, centered carousel, not a static grid", async () => {
  const flow = await Deno.readTextFile(new URL("src/onboarding/OnboardingWelcomeFlow.jsx", root));
  assert(flow.includes("onboarding-carousel-frame"), "the Modes step must use the fixed-size carousel frame, not the old per-slide grid");
  assert(flow.includes("MODE_SLIDES"), "the carousel must be driven by the same 3-slide list (element/snip/save-page)");
  assert(!flow.includes("onboarding-learn-gallery"), "the old static 3-column gallery markup must be fully replaced by the carousel");
});

Deno.test("the one-task flow has one persistent exit to the usable Nest", async () => {
  const flow = await Deno.readTextFile(new URL("src/onboarding/OnboardingWelcomeFlow.jsx", root));
  assert(flow.includes("onboarding-wizard-footer"), "the wizard must render a single persistent footer");
  assert(flow.includes("Go to Nest"), "the footer must return to the real workspace");
  assert(!flow.includes("handleContinue"), "there must be no hidden multi-step navigation handler");
});
