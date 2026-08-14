// Pure onboarding state derivation — no React, no base44 import, so it can
// be unit-tested standalone once test tooling lands (see plan for #17/G9).

export const OnboardingStage = Object.freeze({
  NOT_PAIRED: "not_paired",
  AWAITING_FIRST_CAPTURE: "awaiting_first_capture",
  FIRST_CAPTURE_RECEIVED: "first_capture_received",
  READY: "ready",
});

export const PairingStepStatus = Object.freeze({
  NONE: "none",
  UNUSED: "unused",
  USED: "used",
  REVOKED: "revoked",
});

export const CaptureOutcome = Object.freeze({
  PROCESSING: "processing",
  ROUTED_EXISTING: "routed_existing",
  CREATED_COLLECTION: "created_collection",
  NEEDS_REVIEW: "needs_review",
  FAILED: "failed",
});

export function derivePairingStepStatus(install) {
  if (!install) return PairingStepStatus.NONE;
  if (!install.active) return PairingStepStatus.REVOKED;
  return install.last_used_at ? PairingStepStatus.USED : PairingStepStatus.UNUSED;
}

export function deriveOverallPairingStatus(extensionInstalls = []) {
  if (extensionInstalls.length === 0) return PairingStepStatus.NONE;
  const active = extensionInstalls.filter((install) => install.active);
  if (active.length === 0) return PairingStepStatus.REVOKED;
  return active.some((install) => install.last_used_at) ? PairingStepStatus.USED : PairingStepStatus.UNUSED;
}

export function mostRecentClip(clips = []) {
  if (clips.length === 0) return null;
  return [...clips].sort((a, b) => new Date(b.captured_at || 0) - new Date(a.captured_at || 0))[0];
}

// routing_status is a closed enum (see base44/entities/clip.jsonc), but this
// still falls back to FAILED for anything unrecognized so the UI never
// renders a blank/undefined outcome.
export function deriveCaptureOutcome(clip) {
  if (!clip) return null;
  switch (clip.routing_status) {
    case "pending":
      return CaptureOutcome.PROCESSING;
    case "routed_existing":
      return CaptureOutcome.ROUTED_EXISTING;
    case "created_collection":
      return CaptureOutcome.CREATED_COLLECTION;
    case "needs_review":
      return CaptureOutcome.NEEDS_REVIEW;
    case "failed":
    default:
      return CaptureOutcome.FAILED;
  }
}

// `dismissed` is checked first and is absorbing: once a user has
// acknowledged their first capture, they stay in READY even if their
// pairing/capture data later looks different (e.g. a future revoke path),
// per "returning users do not see the full first-run tour again."
export function deriveOnboardingStage({ extensionInstalls = [], clips = [], dismissed = false } = {}) {
  if (dismissed) return OnboardingStage.READY;
  const hasActivePairing = extensionInstalls.some((install) => install.active);
  if (!hasActivePairing) return OnboardingStage.NOT_PAIRED;
  if (clips.length === 0) return OnboardingStage.AWAITING_FIRST_CAPTURE;
  return OnboardingStage.FIRST_CAPTURE_RECEIVED;
}
