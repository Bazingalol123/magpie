import { useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Camera,
  Check,
  Crop,
  Download,
  FileText,
  Key,
  Link2,
  LoaderCircle,
  MousePointerClick,
  Smartphone,
  Sparkles,
  TrendingDown,
  X,
} from "lucide-react";
import { PairingStepStatus, deriveOverallPairingStatus } from "./state.js";

const STEP_ORDER = ["welcome", "project", "pair", "modes", "collections", "agent", "sync"];

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

function PairStep({ extensionInstalls, isPairing, onPair, onNext }) {
  const overallStatus = deriveOverallPairingStatus(extensionInstalls);
  const isReconnect = overallStatus === PairingStepStatus.REVOKED;
  const isPaired = overallStatus === PairingStepStatus.USED || overallStatus === PairingStepStatus.UNUSED;
  return (
    <div className="onboarding-wizard-step">
      <div className="eyebrow">step 1 · desktop</div>
      <h1>Download and pair the Chrome extension.</h1>
      <p className="onboarding-wizard-lede">
        It opens as a Side Panel that stays with you while you browse any page -- the fastest way to
        capture from your computer.
      </p>
      <div className="onboarding-wizard-actions">
        <button type="button" className="onboarding-cta" onClick={onPair} disabled={isPairing}>
          {isPairing ? <LoaderCircle className="spin" size={15} /> : <Key size={15} />}
          {isPaired ? "Paired" : isReconnect ? "Reconnect extension" : "Pair extension"}
        </button>
        <a className="onboarding-cta onboarding-cta-secondary" href={EXTENSION_RELEASES_URL} target="_blank" rel="noreferrer">
          <Download size={14} /> Get the extension
        </a>
      </div>
      <div className="onboarding-wizard-actions onboarding-wizard-actions-quiet">
        <button type="button" className="onboarding-cta onboarding-cta-secondary" onClick={onNext}>
          <ArrowRight size={15} /> {isPaired ? "Continue" : "I'll pair it later -- continue"}
        </button>
      </div>
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

function ModesStep({ onOpenIosSetup, onPasteCapture, isMobileCapturing, mobileCaptureError, onNext }) {
  return (
    <div className="onboarding-wizard-step">
      <div className="eyebrow">step 2 · how to capture</div>
      <h1>Three ways to clip from your computer.</h1>
      <p className="onboarding-wizard-lede">
        Real screenshots of the actual extension -- not a mockup. All three work from the Side
        Panel or its keyboard shortcut (Alt+Shift+M / ⌘+Shift+M).
      </p>
      <div className="onboarding-learn-gallery onboarding-learn-gallery-three">
        <figure className="onboarding-learn-frame">
          <img src="/onboarding/mode-element.gif" alt="Hovering an element on a page highlights it, then it's captured" loading="lazy" />
          <figcaption><MousePointerClick size={12} /> Clip Element -- hover, press C</figcaption>
        </figure>
        <figure className="onboarding-learn-frame">
          <img src="/onboarding/mode-snip.gif" alt="Dragging a rectangle over part of a page crops and captures it" loading="lazy" />
          <figcaption><Crop size={12} /> Snip Area -- drag a rectangle</figcaption>
        </figure>
        <figure className="onboarding-learn-frame">
          <img src="/onboarding/desktop-capture.gif" alt="Clicking Save Page in the Side Panel captures the whole page" loading="lazy" />
          <figcaption><FileText size={12} /> Save Page -- one click</figcaption>
        </figure>
      </div>
      <div className="onboarding-wizard-subhead">On your phone</div>
      <ol className="onboarding-method-grid">
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
        <button type="button" className="onboarding-cta" onClick={onNext}>
          <ArrowRight size={15} /> Continue
        </button>
      </div>
    </div>
  );
}

function CollectionsPreviewStep({ onNext }) {
  return (
    <div className="onboarding-wizard-step">
      <div className="eyebrow">step 3 · organized automatically</div>
      <h1>Everything you save lands in a Collection.</h1>
      <p className="onboarding-wizard-lede">
        The screenshot below is a real capture through the flow above. The extra cards are an
        example of what a fuller workspace looks like -- your own Collections will reflect what you
        actually save.
      </p>
      <figure className="onboarding-preview-frame">
        <img src="/onboarding/first-value.png" alt="A captured Item, routed into a new Collection, shown in the Magpie dashboard" loading="lazy" />
        <figcaption>Real: a page capture, routed and shown in its Collection.</figcaption>
      </figure>
      <div className="onboarding-mock-badge">Example workspace</div>
      <ol className="onboarding-mock-grid">
        <li className="onboarding-mock-card">
          <div className="onboarding-mock-card-head"><Camera size={13} /> Cameras</div>
          <b>Sony Alpha 6600</b>
          <span className="onboarding-mock-card-badge drop"><TrendingDown size={11} /> price dropped</span>
        </li>
        <li className="onboarding-mock-card">
          <div className="onboarding-mock-card-head"><FileText size={13} /> Recipes</div>
          <b>Shakshuka, proper heat</b>
          <span className="onboarding-mock-card-badge">4 saved</span>
        </li>
      </ol>
      <div className="onboarding-wizard-actions onboarding-wizard-actions-quiet">
        <button type="button" className="onboarding-cta" onClick={onNext}>
          <ArrowRight size={15} /> Continue
        </button>
      </div>
    </div>
  );
}

function AgentPreviewStep({ onNext }) {
  return (
    <div className="onboarding-wizard-step">
      <div className="eyebrow">step 4 · ask magpie</div>
      <h1>Ask questions about what you've saved.</h1>
      <p className="onboarding-wizard-lede">
        Ask Magpie compares your Items, explains routing, and can configure watches -- across your
        real saved data. The conversation below is an example, not a live answer.
      </p>
      <div className="onboarding-mock-badge">Example conversation</div>
      <div className="onboarding-mock-chat">
        <div className="agent-message user"><span>You</span><p>Which of the two apartments has better transit access?</p></div>
        <div className="agent-message assistant"><span>Magpie</span><div className="agent-md"><p>The Kreuzberg listing is a 4-minute walk to the U-Bahn; the other is 12 minutes. Both are within budget -- Kreuzberg is also €80/month cheaper.</p></div></div>
      </div>
      <div className="onboarding-wizard-actions onboarding-wizard-actions-quiet">
        <button type="button" className="onboarding-cta" onClick={onNext}>
          <ArrowRight size={15} /> Continue
        </button>
      </div>
    </div>
  );
}

function SyncPreviewStep({ onFinish }) {
  return (
    <div className="onboarding-wizard-step">
      <div className="eyebrow">step 5 · always current</div>
      <h1>Magpie keeps watching after you save.</h1>
      <p className="onboarding-wizard-lede">
        Sources you save get checked automatically, and real changes show up as field updates --
        without you having to revisit the page. Shown below is an example; nothing has changed yet
        for a source you just saved.
      </p>
      <div className="onboarding-mock-badge">Example update</div>
      <div className="onboarding-mock-sync">
        <span className="onboarding-mock-card-badge drop"><TrendingDown size={11} /> price dropped</span>
        <span className="onboarding-mock-sync-row"><s>€650</s> → <b>€570</b> / month</span>
      </div>
      <div className="onboarding-wizard-actions">
        <button type="button" className="onboarding-cta" onClick={onFinish}>
          <Check size={15} /> Go to my dashboard
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
            if (created) setStep("pair");
          }}
          onSkip={() => setStep("pair")}
        />
      )}
      {step === "pair" && (
        <PairStep extensionInstalls={extensionInstalls} isPairing={isPairing} onPair={onPair} onNext={() => setStep("modes")} />
      )}
      {step === "modes" && (
        <ModesStep
          onOpenIosSetup={onOpenIosSetup}
          onPasteCapture={onPasteCapture}
          isMobileCapturing={isMobileCapturing}
          mobileCaptureError={mobileCaptureError}
          onNext={() => setStep("collections")}
        />
      )}
      {step === "collections" && <CollectionsPreviewStep onNext={() => setStep("agent")} />}
      {step === "agent" && <AgentPreviewStep onNext={() => setStep("sync")} />}
      {step === "sync" && <SyncPreviewStep onFinish={onSkipToWorkspace} />}
      <div className="pairing-note"><Check size={14} /> Project creation is optional and never blocks your first capture.</div>
    </section>
  );
}
