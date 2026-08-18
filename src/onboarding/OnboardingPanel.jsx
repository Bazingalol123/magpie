import { OnboardingStage } from "./state.js";
import PairingChecklist from "./PairingChecklist.jsx";
import CaptureStatusBanner from "./CaptureStatusBanner.jsx";

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
}) {
  if (stage === OnboardingStage.NOT_PAIRED || stage === OnboardingStage.AWAITING_FIRST_CAPTURE) {
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
        onDismiss={onDismiss}
      />
    );
  }
  return null;
}
