import { Check, ChevronRight, Layers3, LoaderCircle, Plus } from "lucide-react";
import { PairingIcon } from "../../components/icons.jsx";

export default function CaptureSourceOffer({ isFirstRun, hasPairedExtension, onPair, isPairing, onPaste, onIos, onOpenLibrary, onOpenGuide }) {
  if (!isFirstRun) {
    return (
      <section className="capture-source-offer is-caught-up">
        <div className="capture-offer-copy">
          <div className="eyebrow">all caught up</div>
          <h2>Nothing needs your decision.</h2>
          <p>Confident captures are already in Collections. Add another page, or browse everything Magpie filed for you.</p>
          <div className="capture-offer-actions">
            <button type="button" className="primary-button" onClick={onPaste}><Plus size={14} /> Add capture</button>
            <button type="button" className="secondary-button" onClick={onOpenLibrary}><Layers3 size={14} /> Browse Collections</button>
            {!hasPairedExtension && <button type="button" className="text-button" onClick={onPair} disabled={isPairing}>{isPairing ? <LoaderCircle className="spin" size={14} /> : <PairingIcon size={14} />} Pair extension</button>}
          </div>
        </div>
        <div className="caught-up-mark" aria-hidden="true"><Check size={28} /></div>
      </section>
    );
  }
  return (
    <section className="capture-source-offer">
      <div className="capture-offer-copy">
        <div className="eyebrow">start here</div>
        <h2>Bring in one page. Magpie handles the filing.</h2>
        <p>Nest only holds captures that need your decision. Confident captures go straight to Collections, whether they come from the extension, your phone, or a pasted link.</p>
        <div className="capture-offer-actions"><button type="button" className="primary-button" onClick={onPair} disabled={isPairing}>{isPairing ? <LoaderCircle className="spin" size={14} /> : <PairingIcon size={14} />} Pair extension</button><button type="button" className="secondary-button" onClick={onPaste}><Plus size={14} /> Paste a link</button><button type="button" className="text-button" onClick={onIos}>Use iPhone / iPad</button></div>
      </div>
      <div className="capture-guide-invite">
        <img src="/onboarding/mode-element.gif" alt="The extension highlighting one listing before capture" />
        <div><span>60-second walkthrough</span><b>See every capture mode at a useful size.</b><button type="button" className="secondary-button" onClick={onOpenGuide}>Open capture guide <ChevronRight size={14} /></button></div>
      </div>
    </section>
  );
}
