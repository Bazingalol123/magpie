// Pure onboarding state derivation — no React, no base44 import, so it can
// be unit-tested standalone once test tooling lands (see plan for #17/G9).

export const OnboardingStage = Object.freeze({
  NOT_PAIRED: "not_paired",
  AWAITING_FIRST_CAPTURE: "awaiting_first_capture",
  FIRST_CAPTURE_RECEIVED: "first_capture_received",
  READY: "ready",
  RECONNECT: "reconnect",
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

// `dismissed` is absorbing for the first-run tour itself: once a user has
// acknowledged their first capture (or explicitly skipped to the workspace),
// the Welcome/Project/Method wizard never reappears. It is not absorbing for
// a real, evidence-backed pairing revocation afterward — a returning user
// whose only active Extension pairing later goes inactive gets a short
// RECONNECT state instead of silence, without re-running the full tour.
//
// Capture evidence (clips.length > 0) outranks desktop pairing status: a
// mobile-only user (iPhone Shortcut / Android Share Target / paste-URL) who
// never pairs the Chrome extension still has a real first capture and must
// reach FIRST_CAPTURE_RECEIVED, not stay stuck in NOT_PAIRED forever.
/**
 * @param {{ extensionInstalls?: Array<{ active: boolean, last_used_at?: string|null }>, clips?: Array<object>, dismissed?: boolean }} [args]
 */
export function deriveOnboardingStage({ extensionInstalls = [], clips = [], dismissed = false } = {}) {
  const overallPairingStatus = deriveOverallPairingStatus(extensionInstalls);
  if (dismissed) {
    return overallPairingStatus === PairingStepStatus.REVOKED ? OnboardingStage.RECONNECT : OnboardingStage.READY;
  }
  if (clips.length > 0) return OnboardingStage.FIRST_CAPTURE_RECEIVED;
  const hasActivePairing = overallPairingStatus === PairingStepStatus.USED || overallPairingStatus === PairingStepStatus.UNUSED;
  return hasActivePairing ? OnboardingStage.AWAITING_FIRST_CAPTURE : OnboardingStage.NOT_PAIRED;
}
