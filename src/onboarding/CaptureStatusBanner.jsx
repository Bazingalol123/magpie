import { AlertTriangle, ArrowRightLeft, Bug, Check, FolderPlus, Inbox, LoaderCircle } from "lucide-react";
import { CaptureOutcome, deriveCaptureOutcome } from "./state.js";

export default function CaptureStatusBanner({ clip, collections, onViewCollection, onOpenReview, onReportIssue, onDismiss }) {
  const outcome = deriveCaptureOutcome(clip);
  const collection = collections.find((item) => item.id === clip?.collection_id);

  let icon = <LoaderCircle className="spin" size={16} />;
  let title = "Organizing your capture…";
  let body = "This usually takes a few seconds.";
  let action = null;

  if (outcome === CaptureOutcome.ROUTED_EXISTING) {
    icon = <ArrowRightLeft size={16} />;
    title = "Your first item landed";
    body = collection ? `Filed into ${collection.name}.` : "Filed into an existing Collection.";
    action = collection && <button className="onboarding-cta onboarding-cta-secondary" onClick={() => onViewCollection(collection.id)}>View Collection</button>;
  } else if (outcome === CaptureOutcome.CREATED_COLLECTION) {
    icon = <FolderPlus size={16} />;
    title = "Your first item landed";
    body = collection ? `Created a new Collection: ${collection.name}.` : "Created a new Collection for it.";
    action = collection && <button className="onboarding-cta onboarding-cta-secondary" onClick={() => onViewCollection(collection.id)}>View Collection</button>;
  } else if (outcome === CaptureOutcome.NEEDS_REVIEW) {
    icon = <Inbox size={16} />;
    title = "One capture needs a quick decision";
    body = "Magpie wasn't confident enough to file this automatically — take a look and choose where it goes.";
    action = <button className="onboarding-cta onboarding-cta-secondary" onClick={() => onOpenReview(clip.id)}>Review now</button>;
  } else if (outcome === CaptureOutcome.FAILED) {
    icon = <AlertTriangle size={16} />;
    title = "Something went wrong organizing this capture";
    body = "You can report this and keep going — it won't block future captures.";
    action = <button className="onboarding-cta onboarding-cta-secondary" onClick={onReportIssue}><Bug size={14} /> Report this</button>;
  }

  return (
    <section className="onboarding-panel" role="region" aria-label="First capture status">
      <div className="onboarding-step">
        <span className="onboarding-step-icon">{icon}</span>
        <div>
          <p role="status">{title}</p>
          <p className="onboarding-step-body">{body}</p>
          <div className="onboarding-actions">
            <span>{action}</span>
            <button className="onboarding-cta" onClick={onDismiss}><Check size={15} /> Got it — continue to my workspace</button>
          </div>
        </div>
      </div>
    </section>
  );
}
