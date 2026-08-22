import { LoaderCircle } from "lucide-react";
import { PairingIcon } from "../components/icons.jsx";

// Deliberately short: a returning user who already completed onboarding
// should not see the full Welcome/Project/Method tour again just because
// their Extension pairing went inactive. This is the one real, evidence-backed
// state change worth surfacing -- everything else about a dismissed
// onboarding stays silent.
export default function ReconnectNotice({ isPairing, onPair }) {
  return (
    <section className="onboarding-panel onboarding-reconnect" role="region" aria-label="Reconnect the extension">
      <div className="onboarding-step">
        <span className="onboarding-step-icon"><PairingIcon size={15} /></span>
        <div>
          <p role="status">Your Chrome extension connection looks inactive.</p>
          <span className="onboarding-step-body">Reconnect to keep capturing from the Side Panel.</span>
        </div>
        <button type="button" className="onboarding-cta" onClick={onPair} disabled={isPairing}>
          {isPairing ? <LoaderCircle className="spin" size={15} /> : <PairingIcon size={15} />} Reconnect extension
        </button>
      </div>
    </section>
  );
}
