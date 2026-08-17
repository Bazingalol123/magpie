import { Check, Download, Key, LoaderCircle, ShieldCheck } from "lucide-react";
import { OnboardingStage, PairingStepStatus, deriveOverallPairingStatus } from "./state.js";

const EXTENSION_RELEASES_URL = "https://github.com/Bazingalol123/magpie/releases/latest";

// The browser can't verify a real install (no externally_connectable
// handshake exists yet), so "installed" is never claimed here — only a
// plain link, per G9's "do not invent a state it cannot verify."
function statusCopy(overallStatus) {
  switch (overallStatus) {
    case PairingStepStatus.USED:
      return "Extension connected. Open the Side Panel on any webpage, or press Alt+Shift+M (⌘+Shift+M on Mac), then choose a page, link, element, text selection, or image to capture.";
    case PairingStepStatus.REVOKED:
      return "This browser's connection looks inactive. Pair again to reconnect.";
    case PairingStepStatus.UNUSED:
    default:
      return "Waiting for the extension — open the side panel and try a capture.";
  }
}

export default function PairingChecklist({ stage, extensionInstalls, isPairing, onPair }) {
  const overallStatus = deriveOverallPairingStatus(extensionInstalls);
  const isReconnect = stage === OnboardingStage.NOT_PAIRED && overallStatus === PairingStepStatus.REVOKED;

  return (
    <section className="onboarding-panel" role="region" aria-label="First-run checklist">
      <div className="eyebrow">{isReconnect ? "reconnect" : stage === OnboardingStage.NOT_PAIRED ? "welcome to magpie" : "your first capture"}</div>
      <div className="onboarding-explainer">
        <strong>Magpie has two parts</strong>
        <span><b>Dashboard</b> is where you view and organize saved Items. <b>Extension</b> is what you use to capture while browsing.</span>
        <span className="onboarding-flow">Browse a webpage <i>→</i> open the Side Panel <i>→</i> capture something <i>→</i> review it here</span>
      </div>
      <ol className="onboarding-steps">
        <li className="onboarding-step">
          <span className="onboarding-step-icon"><Download size={15} /></span>
          <div>
            <p>Install the Chrome extension</p>
            <span className="onboarding-step-body">It opens as a Side Panel that stays available while you browse.</span>
            <a className="onboarding-cta onboarding-cta-secondary" href={EXTENSION_RELEASES_URL} target="_blank" rel="noreferrer">
              Get extension
            </a>
          </div>
        </li>
        <li className="onboarding-step">
          <span className="onboarding-step-icon"><Key size={15} /></span>
          <div>
            <p>Pair the extension to your library</p>
            <button className="onboarding-cta" onClick={onPair} disabled={isPairing}>
              {isPairing ? <LoaderCircle className="spin" size={15} /> : <Key size={15} />}
              {isReconnect ? "Reconnect extension" : "Pair extension"}
            </button>
            <span className="onboarding-shortcut">Picker shortcut: <kbd>Alt + Shift + M</kbd> · Mac <kbd>⌘ + Shift + M</kbd></span>
          </div>
        </li>
        {stage === OnboardingStage.AWAITING_FIRST_CAPTURE && (
          <li className="onboarding-step">
            <span className="onboarding-step-icon">
              {overallStatus === PairingStepStatus.USED ? <Check size={15} /> : <LoaderCircle className="spin" size={15} />}
            </span>
            <div>
              <p role="status">{statusCopy(overallStatus)}</p>
              {overallStatus === PairingStepStatus.REVOKED && (
                <button className="onboarding-cta onboarding-cta-secondary" onClick={onPair} disabled={isPairing}>
                  {isPairing ? <LoaderCircle className="spin" size={15} /> : <Key size={15} />} Pair again
                </button>
              )}
            </div>
          </li>
        )}
      </ol>
      <div className="pairing-note"><ShieldCheck size={16} /> The extension only ever submits clips. It cannot read anything from Magpie.</div>
    </section>
  );
}
