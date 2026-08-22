import { assert } from "jsr:@std/assert@1";

const root = new URL("../", import.meta.url);

Deno.test("the onboarding walkthrough assets are real, non-empty files, not placeholders", async () => {
  for (const asset of ["public/onboarding/desktop-capture.gif", "public/onboarding/first-value.png"]) {
    const bytes = await Deno.readFile(new URL(asset, root));
    assert(bytes.length > 1000, `${asset} is missing or suspiciously small (${bytes.length} bytes)`);
  }
});

Deno.test("the onboarding flow teaches before it asks the user to set up a capture method", async () => {
  const flow = await Deno.readTextFile(new URL("src/onboarding/OnboardingWelcomeFlow.jsx", root));
  assert(flow.includes('src="/onboarding/desktop-capture.gif"'), "the Learn step must reference the recorded desktop-capture walkthrough");
  assert(flow.includes('src="/onboarding/first-value.png"'), "the Learn step must reference the real first-value screenshot");
  // Order matters: guidance (learn) must come before setup (method) in the
  // step transitions, per "guidance then setup - then dashboard."
  const learnIndex = flow.indexOf('step === "learn"');
  const methodIndex = flow.indexOf('step === "method"');
  assert(learnIndex !== -1 && methodIndex !== -1 && learnIndex < methodIndex, "the learn step must be wired before the method step");
});
