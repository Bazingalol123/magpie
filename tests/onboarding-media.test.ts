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
  assert(flow.includes('src="/onboarding/mode-element.gif"'), "the Modes step must reference the recorded element-picker walkthrough");
  assert(flow.includes('src="/onboarding/mode-snip.gif"'), "the Modes step must reference the recorded snip walkthrough");
  assert(flow.includes('src="/onboarding/desktop-capture.gif"'), "the Modes step must reference the recorded page-save walkthrough");
  assert(flow.includes('src="/onboarding/first-value.png"'), "the Collections preview step must reference the real first-value screenshot");

  // Order per the owner's explicit revision: pair -> modes -> collections ->
  // agent -> sync -> dashboard (not "teach before setup" as originally built).
  const order = ["welcome", "project", "pair", "modes", "collections", "agent", "sync"];
  const indices = order.map((step) => flow.indexOf(`step === "${step}"`));
  for (const index of indices) assert(index !== -1, `missing step in the wizard: expected all of ${order.join(", ")}`);
  for (let i = 1; i < indices.length; i++) {
    assert(indices[i - 1] < indices[i], `step "${order[i - 1]}" must be wired before step "${order[i]}"`);
  }
});

Deno.test("illustrative preview content is clearly labeled, not presented as the user's real data", async () => {
  const flow = await Deno.readTextFile(new URL("src/onboarding/OnboardingWelcomeFlow.jsx", root));
  assert(flow.includes("onboarding-mock-badge"), "mock/preview content must carry a distinct visual label");
  assert((flow.match(/Example/g) || []).length >= 3, "the Collections/Agent/Sync preview steps must each say \"Example\" so mock content is never mistaken for real data");
});
