import { useEffect, useState } from "react";
import { ArrowLeft, ArrowRight, Check, Inbox, Layers3, LoaderCircle, Radio, X } from "lucide-react";
import { ClipElementIcon, PairingIcon, SavePageIcon, SnipAreaIcon } from "../components/icons.jsx";

// Desktop-only: this walks through the extension's capture modes. Mobile is
// a read/organize surface with no capture path, so it never opens this.
const OUTCOME_STEP = {
  label: "What happens next",
  title: "Magpie handles the filing.",
  body: "Structured Items go straight into Collections. Ambiguous captures wait in Nest for one decision. Watches keep checking sources and surface meaningful changes in Signals.",
  icon: Layers3,
  isLast: true,
};

const GUIDE_STEPS = [
  {
    label: "Clip Element",
    title: "Clip exactly what matters.",
    body: "Hover the product, listing, paragraph, or card you care about, then press C. Magpie keeps that element with its page context.",
    src: "/onboarding/mode-element.gif",
    alt: "The extension highlighting one listing and clipping it from a page",
    icon: ClipElementIcon,
  },
  {
    label: "Snip Area",
    title: "Snip what you can see.",
    body: "Drag over a visual area when the useful information is in an image, chart, map, or layout that is easier to show than select.",
    src: "/onboarding/mode-snip.gif",
    alt: "The extension dragging a capture rectangle over part of a listing",
    icon: SnipAreaIcon,
  },
  {
    label: "Save Page",
    title: "Save the whole page.",
    body: "Use Save Page when the entire source matters. You can still choose a Project and tell Magpie whether you want to reference, compare, watch, or act on it.",
    src: "/onboarding/desktop-capture.gif",
    alt: "The Magpie extension Side Panel showing Clip Element, Snip Area, and Save Page",
    icon: SavePageIcon,
  },
  OUTCOME_STEP,
];

function CaptureOutcomePreview() {
  return (
    <div className="capture-guide-outcome-preview" aria-label="A capture moving through the current Magpie workspace">
      <div className="capture-guide-outcome-head">
        <div><span className="capture-guide-mini-mark">M</span><b>magpie</b></div>
        <span><i /> synced now</span>
      </div>
      <div className="capture-guide-outcome-project">
        <span>current project</span>
        <b>Apartment search</b>
        <small>Everything stays organized around what you are trying to do.</small>
      </div>
      <div className="capture-guide-outcome-flow">
        <div>
          <span className="capture-guide-outcome-icon"><Inbox size={15} /></span>
          <b>Nest</b>
          <small>Only captures that need one decision</small>
          <em>1 waiting</em>
        </div>
        <ArrowRight className="capture-guide-outcome-arrow" size={16} />
        <div className="is-primary">
          <span className="capture-guide-outcome-icon"><Layers3 size={15} /></span>
          <b>Collections</b>
          <small>Confident captures file themselves</small>
          <em>6 items</em>
        </div>
        <ArrowRight className="capture-guide-outcome-arrow" size={16} />
        <div>
          <span className="capture-guide-outcome-icon"><Radio size={15} /></span>
          <b>Signals</b>
          <small>Watches surface meaningful changes</small>
          <em>2 updates</em>
        </div>
      </div>
    </div>
  );
}

export default function CaptureGuideDialog({ onClose, onPair, isPairing, hasPairedExtension }) {
  const [stepIndex, setStepIndex] = useState(0);
  const step = GUIDE_STEPS[stepIndex];
  const Icon = step.icon;

  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key === "Escape") onClose();
      if (event.key === "ArrowLeft") setStepIndex((current) => Math.max(0, current - 1));
      if (event.key === "ArrowRight") setStepIndex((current) => Math.min(GUIDE_STEPS.length - 1, current + 1));
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const closeThen = (action) => {
    onClose();
    action();
  };

  return (
    <div className="detail-overlay capture-guide-overlay" role="presentation" onMouseDown={onClose}>
      <section className="capture-guide-dialog" role="dialog" aria-modal="true" aria-labelledby="capture-guide-title" onMouseDown={(event) => event.stopPropagation()}>
        <header className="capture-guide-head">
          <div><div className="eyebrow"><Icon size={13} /> capture guide · {stepIndex + 1} of {GUIDE_STEPS.length}</div><h2 id="capture-guide-title">{step.title}</h2></div>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Close capture guide"><X size={18} /></button>
        </header>

        <div className={`capture-guide-body${step.isLast ? " is-outcome" : ""}`}>
          <figure className={`capture-guide-media${step.label === "Save Page" ? " is-portrait" : ""}`}>
            {step.isLast ? <CaptureOutcomePreview /> : step.src ? <img src={step.src} alt={step.alt} /> : <div className="capture-guide-icon-figure" aria-hidden="true"><Icon size={56} /></div>}
          </figure>

          <div className="capture-guide-copy">
            <span className="capture-guide-step-icon"><Icon size={16} /></span>
            <b>{step.label}</b>
            <p>{step.body}</p>
            {step.isLast && (
              <div className="capture-guide-source-actions">
                <button type="button" className="primary-button" disabled={isPairing} onClick={() => closeThen(onPair)}>{isPairing ? <LoaderCircle className="spin" size={14} /> : <PairingIcon size={14} />} {hasPairedExtension ? "Pair another browser" : "Pair extension"}</button>
              </div>
            )}
          </div>
        </div>

        <footer className="capture-guide-footer">
          {stepIndex === 0
            ? <button type="button" className="secondary-button" onClick={onClose}>Close</button>
            : <button type="button" className="secondary-button" onClick={() => setStepIndex((current) => Math.max(0, current - 1))}><ArrowLeft size={14} /> Back</button>}
          <div className="capture-guide-progress" role="group" aria-label="Capture guide steps">
            {GUIDE_STEPS.map((item, index) => <button key={item.label} type="button" className={index === stepIndex ? "active" : ""} onClick={() => setStepIndex(index)} aria-label={`Go to ${item.label}`} aria-current={index === stepIndex ? "step" : undefined} />)}
          </div>
          {step.isLast
            ? <button type="button" className="primary-button" onClick={onClose}><Check size={14} /> Done</button>
            : <button type="button" className="primary-button" onClick={() => setStepIndex((current) => Math.min(GUIDE_STEPS.length - 1, current + 1))}>Next <ArrowRight size={14} /></button>}
        </footer>
      </section>
    </div>
  );
}
