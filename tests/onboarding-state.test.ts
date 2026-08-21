import { assertEquals } from "jsr:@std/assert";
import {
  OnboardingStage,
  PairingStepStatus,
  deriveOnboardingStage,
  deriveOverallPairingStatus,
  derivePairingStepStatus,
} from "../src/onboarding/state.js";

// The full Welcome -> Project -> Method -> Capture -> Value onboarding flow
// hangs off this one pure stage machine. These fixtures pin down two real
// behavior changes made for that flow, plus the pre-existing contract so a
// regression here can't silently break either the new mobile-first path or
// the returning-user tour suppression it must not disturb.

Deno.test("no pairing and no clips stays NOT_PAIRED", () => {
  assertEquals(deriveOnboardingStage({ extensionInstalls: [], clips: [] }), OnboardingStage.NOT_PAIRED);
});

Deno.test("an active, unused pairing with no clips is AWAITING_FIRST_CAPTURE", () => {
  const stage = deriveOnboardingStage({
    extensionInstalls: [{ active: true, last_used_at: null }],
    clips: [],
  });
  assertEquals(stage, OnboardingStage.AWAITING_FIRST_CAPTURE);
});

Deno.test("an active pairing plus a clip is FIRST_CAPTURE_RECEIVED", () => {
  const stage = deriveOnboardingStage({
    extensionInstalls: [{ active: true, last_used_at: "2026-08-01T00:00:00Z" }],
    clips: [{ id: "clip-1" }],
  });
  assertEquals(stage, OnboardingStage.FIRST_CAPTURE_RECEIVED);
});

Deno.test("a mobile-only user (no Extension pairing, real clip) still reaches FIRST_CAPTURE_RECEIVED", () => {
  // Regression guard: this used to gate on hasActivePairing before checking
  // clips.length, so an iPhone Shortcut / Android Share Target / paste-URL
  // capture with zero Chrome extension pairings stayed stuck in NOT_PAIRED
  // forever and never showed the First Value screen.
  const stage = deriveOnboardingStage({
    extensionInstalls: [],
    clips: [{ id: "clip-1" }],
  });
  assertEquals(stage, OnboardingStage.FIRST_CAPTURE_RECEIVED);
});

Deno.test("a revoked-only pairing with no clips, not dismissed, stays NOT_PAIRED", () => {
  const stage = deriveOnboardingStage({
    extensionInstalls: [{ active: false, last_used_at: "2026-08-01T00:00:00Z" }],
    clips: [],
  });
  assertEquals(stage, OnboardingStage.NOT_PAIRED);
});

Deno.test("dismissed onboarding with no pairing history stays READY", () => {
  const stage = deriveOnboardingStage({ extensionInstalls: [], clips: [], dismissed: true });
  assertEquals(stage, OnboardingStage.READY);
});

Deno.test("dismissed onboarding with a healthy active pairing stays READY", () => {
  const stage = deriveOnboardingStage({
    extensionInstalls: [{ active: true, last_used_at: "2026-08-01T00:00:00Z" }],
    clips: [{ id: "clip-1" }],
    dismissed: true,
  });
  assertEquals(stage, OnboardingStage.READY);
});

Deno.test("dismissed onboarding with a revoked pairing surfaces a short RECONNECT state", () => {
  // Point 7 of the onboarding spec: a returning user who already completed
  // onboarding should not see the full Welcome/Project/Method tour again,
  // but a real pairing revocation must not go silent either.
  const stage = deriveOnboardingStage({
    extensionInstalls: [{ active: false, last_used_at: "2026-08-01T00:00:00Z" }],
    clips: [{ id: "clip-1" }],
    dismissed: true,
  });
  assertEquals(stage, OnboardingStage.RECONNECT);
});

Deno.test("dismissed onboarding never regresses to the RECONNECT state for a user who never paired", () => {
  const stage = deriveOnboardingStage({ extensionInstalls: [], clips: [{ id: "clip-1" }], dismissed: true });
  assertEquals(stage, OnboardingStage.READY);
});

Deno.test("deriveOverallPairingStatus treats any active install as non-revoked, even alongside inactive ones", () => {
  const status = deriveOverallPairingStatus([
    { active: false, last_used_at: "2026-08-01T00:00:00Z" },
    { active: true, last_used_at: null },
  ]);
  assertEquals(status, PairingStepStatus.UNUSED);
});

Deno.test("derivePairingStepStatus reports REVOKED for an inactive install", () => {
  assertEquals(derivePairingStepStatus({ active: false, last_used_at: "2026-08-01T00:00:00Z" }), PairingStepStatus.REVOKED);
});
