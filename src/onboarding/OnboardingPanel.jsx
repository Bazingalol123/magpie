import { OnboardingStage } from "./state.js";
import OnboardingWelcomeFlow from "./OnboardingWelcomeFlow.jsx";
import PairingChecklist from "./PairingChecklist.jsx";
import CaptureStatusBanner from "./CaptureStatusBanner.jsx";
import ReconnectNotice from "./ReconnectNotice.jsx";

export default function OnboardingPanel({
  stage,
  extensionInstalls,
  mostRecentClip,
  collections,
  isPairing,
  onPair,
  onDismiss,
  onViewCollection,
  onOpenReview,
  onReportIssue,
  onOpenWorkspace,
  onCreateProject,
  isCreatingProject,
  projectError,
  onOpenIosSetup,
  onPasteCapture,
  isMobileCapturing,
  mobileCaptureError,
  onSaveAnother,
  onRetryCapture,
}) {
  if (stage === OnboardingStage.NOT_PAIRED) {
    return (
      <OnboardingWelcomeFlow
        extensionInstalls={extensionInstalls}
        isPairing={isPairing}
        onPair={onPair}
        onSkipToWorkspace={onDismiss}
        onCreateProject={onCreateProject}
        isCreatingProject={isCreatingProject}
        projectError={projectError}
        onOpenIosSetup={onOpenIosSetup}
        onPasteCapture={onPasteCapture}
        isMobileCapturing={isMobileCapturing}
        mobileCaptureError={mobileCaptureError}
      />
    );
  }
  if (stage === OnboardingStage.AWAITING_FIRST_CAPTURE) {
    return <PairingChecklist stage={stage} extensionInstalls={extensionInstalls} isPairing={isPairing} onPair={onPair} onOpenWorkspace={onOpenWorkspace} />;
  }
  if (stage === OnboardingStage.FIRST_CAPTURE_RECEIVED) {
    return (
      <CaptureStatusBanner
        clip={mostRecentClip}
        collections={collections}
        onViewCollection={onViewCollection}
        onOpenReview={onOpenReview}
        onReportIssue={onReportIssue}
        onSaveAnother={onSaveAnother}
        onRetry={onRetryCapture}
        onDismiss={onDismiss}
      />
    );
  }
  if (stage === OnboardingStage.RECONNECT) {
    return <ReconnectNotice isPairing={isPairing} onPair={onPair} />;
  }
  return null;
}
