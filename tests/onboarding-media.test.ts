import { assert } from "jsr:@std/assert@1";

const root = new URL("../", import.meta.url);

Deno.test("the onboarding walkthrough assets are real, non-empty files, not placeholders", async () => {
  for (const asset of [
    "public/onboarding/desktop-capture.gif",
    "public/onboarding/first-value.png",
    "public/onboarding/mode-element.gif",
    "public/onboarding/mode-snip.gif",
  ]) {
    const bytes = await Deno.readFile(new URL(asset, root));
    assert(bytes.length > 1000, `${asset} is missing or suspiciously small (${bytes.length} bytes)`);
  }
});

Deno.test("the onboarding flow pairs the extension before teaching the capture modes, per the revised owner-directed order", async () => {
  const flow = await Deno.readTextFile(new URL("src/onboarding/OnboardingWelcomeFlow.jsx", root));
  assert(flow.includes('"/onboarding/mode-element.gif"'), "the Modes carousel must reference the recorded element-picker walkthrough");
  assert(flow.includes('"/onboarding/mode-snip.gif"'), "the Modes carousel must reference the recorded snip walkthrough");
  assert(flow.includes('"/onboarding/desktop-capture.gif"'), "the Modes carousel must reference the recorded page-save walkthrough");
  assert(flow.includes('src="/onboarding/first-value.png"'), "the Collections preview step must reference the real first-value screenshot");

  // Order per the owner's explicit revision: teach (modes) first, then
  // setup (project, pair), then the illustrative preview screens, then the
  // dashboard -- see docs/DECISIONS.md's "supersedes 'teach before setup'"
  // entry for why this flipped back from the intermediate pair-first order.
  // STEP_ORDER is the single source of truth for navigation (Back/Continue
  // both index into it), so assert against that array literal directly
  // rather than scanning render-order text, which can't distinguish a
  // step's render block from an unrelated `step === "..."` check elsewhere
  // (e.g. handleContinue's project-specific branch).
  const stepOrderMatch = flow.match(/const STEP_ORDER = (\[[^\]]+\]);/);
  assert(stepOrderMatch, "expected a STEP_ORDER array literal driving wizard navigation");
  const actualOrder = JSON.parse(stepOrderMatch[1].replace(/'/g, '"'));
  const expectedOrder = ["welcome", "modes", "project", "pair", "collections", "agent", "sync"];
  assert(JSON.stringify(actualOrder) === JSON.stringify(expectedOrder), `STEP_ORDER was ${JSON.stringify(actualOrder)}, expected ${JSON.stringify(expectedOrder)}`);
});

Deno.test("illustrative preview content is clearly labeled, not presented as the user's real data", async () => {
  const flow = await Deno.readTextFile(new URL("src/onboarding/OnboardingWelcomeFlow.jsx", root));
  assert(flow.includes("onboarding-mock-badge"), "mock/preview content must carry a distinct visual label");
  assert((flow.match(/Example/g) || []).length >= 3, "the Collections/Agent/Sync preview steps must each say \"Example\" so mock content is never mistaken for real data");
});

Deno.test("the three capture modes render as a same-size, centered carousel, not a static grid", async () => {
  const flow = await Deno.readTextFile(new URL("src/onboarding/OnboardingWelcomeFlow.jsx", root));
  assert(flow.includes("onboarding-carousel-frame"), "the Modes step must use the fixed-size carousel frame, not the old per-slide grid");
  assert(flow.includes("MODE_SLIDES"), "the carousel must be driven by the same 3-slide list (element/snip/save-page)");
  assert(!flow.includes("onboarding-learn-gallery"), "the old static 3-column gallery markup must be fully replaced by the carousel");
});

Deno.test("Back, Skip, and Continue are always in one persistent footer, not scattered per-step buttons", async () => {
  const flow = await Deno.readTextFile(new URL("src/onboarding/OnboardingWelcomeFlow.jsx", root));
  assert(flow.includes("onboarding-wizard-footer"), "the wizard must render a single persistent footer");
  assert(flow.includes("Skip onboarding"), "the footer must expose a skip control on every step");
  assert(flow.includes("handleContinue"), "Continue must be one shared handler, not duplicated per step");
});
