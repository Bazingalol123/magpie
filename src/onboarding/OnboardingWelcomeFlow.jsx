import { useState } from "react";
import { ArrowLeft, ArrowRight, Check, Download, Key, Link2, LoaderCircle, Monitor, Smartphone, Sparkles, X } from "lucide-react";
import { PairingStepStatus, deriveOverallPairingStatus } from "./state.js";

const STEP_ORDER = ["welcome", "project", "learn", "method"];

function BackLink({ step, onStepChange }) {
  const index = STEP_ORDER.indexOf(step);
  if (index <= 0) return null;
  return (
    <button type="button" className="onboarding-back-link" onClick={() => onStepChange(STEP_ORDER[index - 1])}>
      <ArrowLeft size={13} /> Back
    </button>
  );
}

const EXTENSION_RELEASES_URL = "https://github.com/Bazingalol123/magpie/releases/latest";

function hostFromUrl(value) {
  try {
    return new URL(value).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

function isSafeHttpUrl(value) {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

// The Web Share Target API has no feature-detectable capability flag; the
// closest honest, real signal is service worker support, which the PWA
// share target depends on. This never claims the app is installed or that
// a share has actually reached it -- only that the platform can support it.
const SUPPORTS_PWA_SHARE_TARGET = typeof navigator !== "undefined" && "serviceWorker" in navigator;

function WelcomeStep({ onStart, onSkipToWorkspace }) {
  return (
    <div className="onboarding-wizard-step">
      <div className="eyebrow">welcome to magpie</div>
      <h1>Turn what you find into an organized workspace.</h1>
      <p className="onboarding-wizard-lede">
        Capture pages, listings, and articles as you research. Magpie reads each one, files it into
        the right Collection, and keeps it current -- so you can compare and decide instead of
        re-digging for the same page later.
      </p>
      <div className="onboarding-wizard-actions">
        <button type="button" className="onboarding-cta" onClick={onStart}>
          <Sparkles size={15} /> Set up my first capture
        </button>
        <button type="button" className="onboarding-cta onboarding-cta-secondary" onClick={onSkipToWorkspace}>
          Explore workspace
        </button>
      </div>
    </div>
  );
}

function LearnStep({ onNext }) {
  return (
    <div className="onboarding-wizard-step">
      <div className="eyebrow">how it works</div>
      <h1>Here's what happens when you save something.</h1>
      <p className="onboarding-wizard-lede">
        Real screenshots of Magpie's own Chrome extension and dashboard -- not a mockup. Set up
        your capture method next; this is just so you know what to expect.
      </p>
      <div className="onboarding-learn-gallery">
        <figure className="onboarding-learn-frame">
          <img src="/onboarding/desktop-capture.gif" alt="The Magpie Side Panel capturing a page: ready, capturing, then captured" loading="lazy" />
          <figcaption>Open the Side Panel and capture any page.</figcaption>
        </figure>
        <figure className="onboarding-learn-frame">
          <img src="/onboarding/first-value.png" alt="A captured Item appearing organized in the Magpie dashboard" loading="lazy" />
          <figcaption>It lands in your workspace, already organized.</figcaption>
        </figure>
      </div>
      <div className="onboarding-wizard-actions">
        <button type="button" className="onboarding-cta" onClick={onNext}>
          <ArrowRight size={15} /> Set up my capture method
        </button>
      </div>
    </div>
  );
}

function ProjectStep({ onCreate, onSkip, isCreating, error }) {
  const [title, setTitle] = useState("");
  const submit = (event) => {
    event.preventDefault();
    if (!title.trim()) return;
    onCreate(title.trim());
  };
  return (
    <div className="onboarding-wizard-step">
      <div className="eyebrow">optional project</div>
      <h1>Give this research a name?</h1>
      <p className="onboarding-wizard-lede">
        A Project groups related Collections around one goal, like an apartment search or a product
        comparison. Entirely optional -- you can skip this and add one later.
      </p>
      <form className="onboarding-wizard-form" onSubmit={submit}>
        <label htmlFor="onboarding-project-title">Project name</label>
        <input
          id="onboarding-project-title"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="Choose my next work laptop"
          autoFocus
        />
        {error && <div className="review-error">{error}</div>}
        <div className="onboarding-wizard-actions">
          <button type="submit" className="onboarding-cta" disabled={isCreating || !title.trim()}>
            {isCreating ? <LoaderCircle className="spin" size={15} /> : <ArrowRight size={15} />} Create Project
          </button>
          <button type="button" className="onboarding-cta onboarding-cta-secondary" onClick={onSkip} disabled={isCreating}>
            Skip
          </button>
        </div>
      </form>
    </div>
  );
}

function PasteUrlCard({ onSubmit, isSubmitting, error }) {
  const [expanded, setExpanded] = useState(false);
  const [url, setUrl] = useState("");
  const [note, setNote] = useState("");
  const submit = (event) => {
    event.preventDefault();
    const host = hostFromUrl(url);
    onSubmit({
      source_url: url,
      raw_text: note.trim() || (host ? `Saved from ${host}` : "Saved from onboarding"),
      capture_intent: "reference",
    });
  };
  if (!expanded) {
    return (
      <li className="onboarding-method-card onboarding-method-fallback">
        <span className="onboarding-step-icon"><Link2 size={15} /></span>
        <div>
          <p>Paste a URL</p>
          <span className="onboarding-step-body">Fallback only -- works anywhere, no setup. Prefer the extension or your phone above when you can.</span>
          <button type="button" className="onboarding-cta onboarding-cta-secondary" onClick={() => setExpanded(true)}>
            Paste a link instead
          </button>
        </div>
      </li>
    );
  }
  return (
    <li className="onboarding-method-card onboarding-method-fallback">
      <span className="onboarding-step-icon"><Link2 size={15} /></span>
      <div>
        <p>Paste a URL</p>
        <form className="onboarding-wizard-form onboarding-paste-form" onSubmit={submit}>
          <input type="url" required value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://…" />
          <input value={note} onChange={(event) => setNote(event.target.value)} placeholder="Why does this matter? (optional)" />
          {error && <div className="review-error">{error}</div>}
          <button type="submit" className="onboarding-cta" disabled={isSubmitting || !isSafeHttpUrl(url)}>
            {isSubmitting ? <LoaderCircle className="spin" size={15} /> : <ArrowRight size={15} />} Save this link
          </button>
        </form>
      </div>
    </li>
  );
}

function MethodStep({
  extensionInstalls,
  isPairing,
  onPair,
  onOpenIosSetup,
  onPasteCapture,
  isMobileCapturing,
  mobileCaptureError,
  onSkipToWorkspace,
}) {
  const overallStatus = deriveOverallPairingStatus(extensionInstalls);
  const isReconnect = overallStatus === PairingStepStatus.REVOKED;
  return (
    <div className="onboarding-wizard-step">
      <div className="eyebrow">capture method</div>
      <h1>How do you want to save things?</h1>
      <p className="onboarding-wizard-lede">Pick whatever fits how you're browsing right now. You can use more than one.</p>
      <ol className="onboarding-method-grid">
        <li className="onboarding-method-card">
          <span className="onboarding-step-icon"><Monitor size={15} /></span>
          <div>
            <p>Desktop -- Chrome extension</p>
            <span className="onboarding-step-body">Opens as a Side Panel that stays with you while you browse any page.</span>
            <button type="button" className="onboarding-cta" onClick={onPair} disabled={isPairing}>
              {isPairing ? <LoaderCircle className="spin" size={15} /> : <Key size={15} />}
              {isReconnect ? "Reconnect extension" : "Pair extension"}
            </button>
            <a className="onboarding-cta onboarding-cta-secondary onboarding-cta-link" href={EXTENSION_RELEASES_URL} target="_blank" rel="noreferrer">
              <Download size={13} /> Don't have it yet? Get the extension
            </a>
          </div>
        </li>
        <li className="onboarding-method-card">
          <span className="onboarding-step-icon"><Smartphone size={15} /></span>
          <div>
            <p>iPhone / iPad</p>
            <span className="onboarding-step-body">Share from Safari with a one-time Shortcut setup. We can't detect your phone automatically -- set it up once, then send a real share to see it land here.</span>
            <button type="button" className="onboarding-cta" onClick={onOpenIosSetup}>
              <ArrowRight size={15} /> Set up the Shortcut
            </button>
          </div>
        </li>
        <li className="onboarding-method-card">
          <span className="onboarding-step-icon"><Smartphone size={15} /></span>
          <div>
            <p>Android</p>
            {SUPPORTS_PWA_SHARE_TARGET ? (
              <span className="onboarding-step-body">Add Magpie to your Home Screen from Chrome's menu, then use Share → Magpie from any page or app.</span>
            ) : (
              <span className="onboarding-step-body">This browser doesn't support installable share targets. Use the Chrome extension, iPhone Shortcut, or paste a URL below instead.</span>
            )}
          </div>
        </li>
        <PasteUrlCard onSubmit={onPasteCapture} isSubmitting={isMobileCapturing} error={mobileCaptureError} />
      </ol>
      <div className="onboarding-wizard-actions onboarding-wizard-actions-quiet">
        <button type="button" className="onboarding-cta onboarding-cta-secondary" onClick={onSkipToWorkspace}>
          Skip for now
        </button>
      </div>
    </div>
  );
}

export default function OnboardingWelcomeFlow({
  extensionInstalls,
  isPairing,
  onPair,
  onSkipToWorkspace,
  onCreateProject,
  isCreatingProject,
  projectError,
  onOpenIosSetup,
  onPasteCapture,
  isMobileCapturing,
  mobileCaptureError,
  initialStep = "welcome",
  onClose,
}) {
  const [step, setStep] = useState(initialStep);
  return (
    <section className="onboarding-panel onboarding-wizard" role="region" aria-label="Get started with Magpie">
      <div className="onboarding-wizard-nav">
        <BackLink step={step} onStepChange={setStep} />
        {onClose && <button type="button" className="icon-button onboarding-wizard-close" onClick={onClose} aria-label="Close"><X size={17} /></button>}
      </div>
      {step === "welcome" && <WelcomeStep onStart={() => setStep("project")} onSkipToWorkspace={onSkipToWorkspace} />}
      {step === "project" && (
        <ProjectStep
          isCreating={isCreatingProject}
          error={projectError}
          onCreate={async (title) => {
            const created = await onCreateProject(title);
            if (created) setStep("learn");
          }}
          onSkip={() => setStep("learn")}
        />
      )}
      {step === "learn" && <LearnStep onNext={() => setStep("method")} />}
      {step === "method" && (
        <MethodStep
          extensionInstalls={extensionInstalls}
          isPairing={isPairing}
          onPair={onPair}
          onOpenIosSetup={onOpenIosSetup}
          onPasteCapture={onPasteCapture}
          isMobileCapturing={isMobileCapturing}
          mobileCaptureError={mobileCaptureError}
          onSkipToWorkspace={onSkipToWorkspace}
        />
      )}
      <div className="pairing-note"><Check size={14} /> Project creation is optional and never blocks your first capture.</div>
    </section>
  );
}
