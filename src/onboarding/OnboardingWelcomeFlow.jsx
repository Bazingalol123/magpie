import { useState } from "react";
import { ArrowRight, ChevronLeft, ChevronRight, Download, Link2, LoaderCircle, Smartphone, X } from "lucide-react";
import { ClipElementIcon, PairingIcon, SavePageIcon, SnipAreaIcon } from "../components/icons.jsx";
import { PairingStepStatus, deriveOverallPairingStatus } from "./state.js";

const EXTENSION_RELEASES_URL = "https://github.com/Bazingalol123/magpie/releases/latest";
const SUPPORTS_PWA_SHARE_TARGET = typeof navigator !== "undefined" && "serviceWorker" in navigator;
const MODE_SLIDES = [
  { src: "/onboarding/mode-element.gif", alt: "Hovering an element on a page highlights it, then it is captured", icon: ClipElementIcon, label: "Clip Element", body: "Hover any element, then press C to clip it." },
  { src: "/onboarding/mode-snip.gif", alt: "Dragging a rectangle over part of a page crops and captures it", icon: SnipAreaIcon, label: "Snip Area", body: "Drag a rectangle over the part you want." },
  { src: "/onboarding/desktop-capture.gif", alt: "Clicking Save Page in the Side Panel captures the whole page", icon: SavePageIcon, label: "Save Page", body: "One click captures the whole page." },
];

function isSafeHttpUrl(value) {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

function ModeCarousel() {
  const [active, setActive] = useState(0);
  const slide = MODE_SLIDES[active];
  const Icon = slide.icon;
  const go = (delta) => setActive((current) => (current + delta + MODE_SLIDES.length) % MODE_SLIDES.length);
  return (
    <div className="onboarding-carousel">
      <div className="onboarding-carousel-frame">
        <button type="button" className="onboarding-carousel-arrow left" onClick={() => go(-1)} aria-label="Previous capture mode"><ChevronLeft size={18} /></button>
        <img src={slide.src} alt={slide.alt} loading="lazy" />
        <button type="button" className="onboarding-carousel-arrow right" onClick={() => go(1)} aria-label="Next capture mode"><ChevronRight size={18} /></button>
      </div>
      <div className="onboarding-carousel-caption"><Icon size={13} /> <b>{slide.label}</b> — {slide.body}</div>
      <div className="onboarding-carousel-dots">
        {MODE_SLIDES.map((item, index) => <button key={item.src} type="button" className={`onboarding-carousel-dot${index === active ? " active" : ""}`} onClick={() => setActive(index)} aria-label={`Show ${item.label}`} aria-current={index === active} />)}
      </div>
    </div>
  );
}

function PasteUrlCard({ onSubmit, isSubmitting, error }) {
  const [expanded, setExpanded] = useState(false);
  const [url, setUrl] = useState("");
  const [note, setNote] = useState("");
  if (!expanded) {
    return (
      <li className="onboarding-method-card onboarding-method-fallback">
        <span className="onboarding-step-icon"><Link2 size={15} /></span>
        <div><p>Paste a URL</p><span className="onboarding-step-body">No setup required. The same authenticated capture pipeline organizes it.</span><button type="button" className="onboarding-cta onboarding-cta-secondary" onClick={() => setExpanded(true)}>Paste a link</button></div>
      </li>
    );
  }
  return (
    <li className="onboarding-method-card onboarding-method-fallback">
      <span className="onboarding-step-icon"><Link2 size={15} /></span>
      <div>
        <p>Paste a URL</p>
        <form className="onboarding-wizard-form onboarding-paste-form" onSubmit={(event) => { event.preventDefault(); onSubmit({ source_url: url, raw_text: note.trim() || "Saved from onboarding", capture_intent: "reference" }); }}>
          <input type="url" required value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://…" />
          <input value={note} onChange={(event) => setNote(event.target.value)} placeholder="Why does this matter? (optional)" />
          {error && <div className="review-error">{error}</div>}
          <button type="submit" className="onboarding-cta" disabled={isSubmitting || !isSafeHttpUrl(url)}>{isSubmitting ? <LoaderCircle className="spin" size={15} /> : <ArrowRight size={15} />} Save this link</button>
        </form>
      </div>
    </li>
  );
}

export default function OnboardingWelcomeFlow({ extensionInstalls, isPairing, onPair, onSkipToWorkspace, onOpenIosSetup, onPasteCapture, isMobileCapturing, mobileCaptureError, onClose }) {
  const pairingStatus = deriveOverallPairingStatus(extensionInstalls);
  const isPaired = pairingStatus === PairingStepStatus.USED || pairingStatus === PairingStepStatus.UNUSED;
  const isReconnect = pairingStatus === PairingStepStatus.REVOKED;
  return (
    <section className="onboarding-panel onboarding-wizard onboarding-single-task" role="region" aria-label="Connect a capture source">
      <div className="onboarding-wizard-scroll">
        {onClose && <button type="button" className="icon-button onboarding-wizard-close" onClick={onClose} aria-label="Close"><X size={17} /></button>}
        <div className="onboarding-wizard-step">
          <div className="eyebrow">one thing to get started</div>
          <h1>Connect the place you capture from.</h1>
          <p className="onboarding-wizard-lede">Pick one real route below. Your first capture will appear in Nest while Magpie organizes it.</p>
          <ModeCarousel />
          <ol className="onboarding-method-grid capture-source-grid">
            <li className="onboarding-method-card capture-source-primary">
              <span className="onboarding-step-icon"><PairingIcon size={15} /></span>
              <div><p>Chrome extension</p><span className="onboarding-step-body">Pair the Side Panel, then clip from any page. Magpie waits for real extension use before marking setup complete.</span><div className="onboarding-wizard-actions"><button type="button" className="onboarding-cta" onClick={onPair} disabled={isPairing || isPaired}>{isPairing ? <LoaderCircle className="spin" size={15} /> : <PairingIcon size={15} />}{isPaired ? "Paired" : isReconnect ? "Reconnect" : "Pair extension"}</button><a className="onboarding-cta onboarding-cta-secondary" href={EXTENSION_RELEASES_URL} target="_blank" rel="noreferrer"><Download size={14} /> Get extension</a></div></div>
            </li>
            <li className="onboarding-method-card">
              <span className="onboarding-step-icon"><Smartphone size={15} /></span>
              <div><p>Phone or tablet</p><span className="onboarding-step-body">{SUPPORTS_PWA_SHARE_TARGET ? "Use Share → Magpie from an installed web app, or connect the iOS Shortcut." : "Connect the iOS Shortcut, then share a real page from Safari."}</span><button type="button" className="onboarding-cta onboarding-cta-secondary" onClick={onOpenIosSetup}>Set up mobile capture</button></div>
            </li>
            <PasteUrlCard onSubmit={onPasteCapture} isSubmitting={isMobileCapturing} error={mobileCaptureError} />
          </ol>
        </div>
      </div>
      <div className="onboarding-wizard-footer"><span>Setup stays available from Nest.</span><button type="button" className="onboarding-cta" onClick={onSkipToWorkspace}>Go to Nest <ArrowRight size={15} /></button></div>
    </section>
  );
}
