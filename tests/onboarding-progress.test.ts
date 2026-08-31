import { assert, assertEquals } from "jsr:@std/assert";
import {
  DEFAULT_ONBOARDING_PROGRESS,
  TourProgressStatus,
  hasStoredOnboardingProgress,
  isTourProgressFinal,
  mergeOnboardingProgress,
  readOnboardingProgress,
} from "../src/tour/onboardingProgress.js";

Deno.test("onboarding progress safely normalizes missing, malformed, and legacy string values", () => {
  assertEquals(readOnboardingProgress(null), DEFAULT_ONBOARDING_PROGRESS);
  assertEquals(readOnboardingProgress("not-json"), DEFAULT_ONBOARDING_PROGRESS);
  assertEquals(readOnboardingProgress(JSON.stringify({
    activation: "completed",
    orientation: "in_progress",
    orientationStep: 3,
  })), {
    activation: "completed",
    orientation: "in_progress",
    orientationStep: 3,
  });
});

Deno.test("activation and orientation progress merge independently", () => {
  const activation = mergeOnboardingProgress(null, { activation: TourProgressStatus.COMPLETED });
  assertEquals(activation, {
    activation: "completed",
    orientation: "not_started",
    orientationStep: 0,
  });
  const orientation = mergeOnboardingProgress(activation, {
    orientation: TourProgressStatus.IN_PROGRESS,
    orientationStep: 4,
  });
  assertEquals(orientation.activation, TourProgressStatus.COMPLETED);
  assertEquals(orientation.orientation, TourProgressStatus.IN_PROGRESS);
  assertEquals(orientation.orientationStep, 4);
});

Deno.test("only completed and skipped tours are terminal", () => {
  assert(isTourProgressFinal(TourProgressStatus.COMPLETED));
  assert(isTourProgressFinal(TourProgressStatus.SKIPPED));
  assert(!isTourProgressFinal(TourProgressStatus.NOT_STARTED));
  assert(!isTourProgressFinal(TourProgressStatus.IN_PROGRESS));
  assert(!hasStoredOnboardingProgress(undefined));
  assert(hasStoredOnboardingProgress({ activation: "completed" }));
});

Deno.test("App persists owner-scoped progress without conflating orientation with legacy dismissal", async () => {
  const app = await Deno.readTextFile(new URL("../src/App.jsx", import.meta.url));
  assert(app.includes("base44.auth.updateMe(update)"), "custom User progress must use authenticated owner-scoped updateMe");
  assert(app.includes("onboarding_progress: nextProgress"), "the update must write the onboarding_progress custom User field");
  assert(app.includes("onboardingDismissed ? TourProgressStatus.SKIPPED"), "the first granular write must preserve an older account's legacy dismissal instead of replaying the other tour");
  assert(app.indexOf("setTourReplayToken((token) => token + 1)") < app.indexOf("await saveProgress"), "replay must restart immediately instead of resetting the visible tour after a delayed User write");
  assert(/finishOrientationTour[\s\S]*?persistOnboardingProgress\(\{[\s\S]*?orientation: status/.test(app), "orientation must persist its own status");
  assert(!/finishOrientationTour[\s\S]*?onboarding_dismissed/.test(app), "orientation progress must not mutate the legacy activation dismissal field");
});

Deno.test("the built-in User schema declares both the granular field and its legacy migration flag", async () => {
  const schema = JSON.parse(await Deno.readTextFile(new URL("../base44/entities/user.jsonc", import.meta.url)));
  assertEquals(schema.name, "User");
  assertEquals(schema.properties.onboarding_dismissed.type, "boolean");
  assertEquals(schema.properties.onboarding_progress.type, "object");
  assertEquals(schema.properties.onboarding_progress.properties.activation.enum, ["not_started", "in_progress", "completed", "skipped"]);
  assertEquals(schema.properties.onboarding_progress.properties.orientation.enum, ["not_started", "in_progress", "completed", "skipped"]);
  assertEquals(schema.properties.onboarding_progress.properties.orientationStep.type, "integer");
});
