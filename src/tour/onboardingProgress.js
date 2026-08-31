export const TourProgressStatus = Object.freeze({
  NOT_STARTED: "not_started",
  IN_PROGRESS: "in_progress",
  COMPLETED: "completed",
  SKIPPED: "skipped",
});

const VALID_STATUSES = new Set(Object.values(TourProgressStatus));

export const DEFAULT_ONBOARDING_PROGRESS = Object.freeze({
  activation: TourProgressStatus.NOT_STARTED,
  orientation: TourProgressStatus.NOT_STARTED,
  orientationStep: 0,
});

function parseStoredValue(value) {
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function normalizeStatus(value) {
  return VALID_STATUSES.has(value) ? value : TourProgressStatus.NOT_STARTED;
}

export function readOnboardingProgress(value) {
  const parsed = parseStoredValue(value);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { ...DEFAULT_ONBOARDING_PROGRESS };
  }
  return {
    activation: normalizeStatus(parsed.activation),
    orientation: normalizeStatus(parsed.orientation),
    orientationStep: Number.isInteger(parsed.orientationStep) && parsed.orientationStep >= 0
      ? parsed.orientationStep
      : 0,
  };
}

export function hasStoredOnboardingProgress(value) {
  const parsed = parseStoredValue(value);
  return !!parsed && typeof parsed === "object" && !Array.isArray(parsed);
}

export function mergeOnboardingProgress(current, patch) {
  return readOnboardingProgress({ ...readOnboardingProgress(current), ...patch });
}

export function isTourProgressFinal(status) {
  return status === TourProgressStatus.COMPLETED || status === TourProgressStatus.SKIPPED;
}
