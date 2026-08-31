import { Check, ChevronRight, Layers3, LoaderCircle, Smartphone } from "lucide-react";
import { PairingIcon } from "../../components/icons.jsx";
import { canInstallExtension } from "../../lib/device.js";
import { canPromptInstall, promptInstall } from "../../lib/pwaInstall.js";

export default function CaptureSourceOffer({ isFirstRun, hasPairedExtension, onPair, isPairing, onOpenLibrary, onShowInstallHelp, onOpenGuide }) {
  const isMobile = !canInstallExtension();
  // Mobile isn't a capture surface -- capture happens on the desktop
  // extension. The one mobile PWA affordance kept is "add to home screen"
  // (a real app icon for reviewing on the go). Android may offer a real
  // one-tap install prompt; otherwise (always on iOS) this opens a focused
  // how-to with the exact taps -- never a silent no-op.
  const handleMobilePrimaryAction = async () => {
    if (canPromptInstall()) {
      const accepted = await promptInstall();
      if (accepted) return;
    }
    onShowInstallHelp();
  };
  if (!isFirstRun) {
    return (
      <section className="capture-source-offer is-caught-up">
        <div className="capture-offer-copy">
          <div className="eyebrow">all caught up</div>
          <h2>Nothing needs your decision.</h2>
          <p>Confident captures are already in Collections. Browse everything Magpie filed for you.</p>
          <div className="capture-offer-actions">
            {isMobile && <button type="button" className="primary-button" onClick={handleMobilePrimaryAction} data-tour="mobile-primary-action"><Smartphone size={14} /> Add Magpie to your home screen</button>}
            <button type="button" className={isMobile ? "secondary-button" : "primary-button"} onClick={onOpenLibrary}><Layers3 size={14} /> Browse Collections</button>
            {!hasPairedExtension && <button type="button" className="text-button" onClick={onPair} disabled={isPairing}>{isPairing ? <LoaderCircle className="spin" size={14} /> : <PairingIcon size={14} />} {isMobile ? "Connect a computer" : "Pair extension"}</button>}
          </div>
        </div>
        <div className="caught-up-mark" aria-hidden="true"><Check size={28} /></div>
      </section>
    );
  }
  if (isMobile) {
    return (
      <section className="capture-source-offer">
        <div className="capture-offer-copy">
          <div className="eyebrow">start here</div>
          <h2>Your captures land here.</h2>
          <p>Capturing happens on your computer, with the Magpie extension. Everything you save shows up in your Library — review and organize it here from your phone.</p>
          <div className="capture-offer-actions"><button type="button" className="primary-button" onClick={handleMobilePrimaryAction} data-tour="mobile-primary-action"><Smartphone size={14} /> Add Magpie to your home screen</button><button type="button" className="secondary-button" onClick={onOpenLibrary}><Layers3 size={14} /> Browse Collections</button>{!hasPairedExtension && <button type="button" className="text-button" onClick={onPair} disabled={isPairing}>{isPairing ? <LoaderCircle className="spin" size={14} /> : <PairingIcon size={14} />} Connect a computer</button>}</div>
        </div>
        <div className="capture-guide-invite">
          <div className="capture-guide-invite-icon" aria-hidden="true"><Smartphone size={28} /></div>
          <div><span>works like an app</span><b>Add Magpie to your home screen to review captures full-screen.</b></div>
        </div>
      </section>
    );
  }
  return (
    <section className="capture-source-offer">
      <div className="capture-offer-copy">
        <div className="eyebrow">start here</div>
        <h2>Bring in one page. Magpie handles the filing.</h2>
        <p>Nest only holds captures that need your decision. Confident captures go straight to Collections. You capture from the extension on any page.</p>
        <div className="capture-offer-actions"><button type="button" className="primary-button" onClick={onPair} disabled={isPairing}>{isPairing ? <LoaderCircle className="spin" size={14} /> : <PairingIcon size={14} />} Pair extension</button><button type="button" className="secondary-button" onClick={onOpenLibrary}><Layers3 size={14} /> Browse Collections</button></div>
      </div>
      <div className="capture-guide-invite">
        <img src="/onboarding/mode-element.gif" alt="The extension highlighting one listing before capture" />
        <div><span>60-second walkthrough</span><b>See every capture mode at a useful size.</b><button type="button" className="secondary-button" onClick={onOpenGuide}>Open capture guide <ChevronRight size={14} /></button></div>
      </div>
    </section>
  );
}
