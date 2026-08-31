import { Share, SquareArrowUp, X } from "lucide-react";
import { isIOS } from "../lib/device.js";

// A focused how-to, not an action button that lies. Adding to the home
// screen is a browser-native gesture no web page can trigger -- on iOS
// Safari especially there is no beforeinstallprompt at all -- so the honest
// thing the in-app "Add Magpie to your home screen" button can do is show
// exactly which two or three taps to make. Confirmed on a real iPhone that
// the previous behavior (a tour tooltip pointing at that button while the
// button actually opened an unrelated capture-guide carousel) read as
// broken and misleading.
export default function AddToHomeScreenGuide({ onClose }) {
  const ios = isIOS();
  return (
    <div className="detail-overlay pairing-overlay" role="presentation" onMouseDown={onClose}>
      <section className="pairing-dialog" role="dialog" aria-modal="true" aria-label="Add Magpie to your home screen" onMouseDown={(event) => event.stopPropagation()}>
        <div className="detail-head">
          <div><div className="eyebrow"><SquareArrowUp size={13} /> add to home screen</div><h2>Add Magpie to your home screen</h2></div>
          <button className="icon-button" onClick={onClose} aria-label="Close"><X size={19} /></button>
        </div>
        <p>{ios
          ? "This happens from Safari's own menu — Magpie can't add it for you, but it's three quick taps:"
          : "This happens from your browser's own menu — it's three quick taps:"}</p>
        <ol className="install-steps">
          {ios ? (
            <>
              <li><span className="install-steps-icon"><Share size={15} /></span> Tap the <b>Share</b> button in Safari's toolbar (the square with an arrow pointing up).</li>
              <li>Scroll down and tap <b>Add to Home Screen</b>.</li>
              <li>Tap <b>Add</b> in the top-right corner.</li>
            </>
          ) : (
            <>
              <li>Open your browser's menu (the <b>⋮</b> in the top-right).</li>
              <li>Tap <b>Add to Home screen</b> or <b>Install app</b>.</li>
              <li>Confirm <b>Install</b>.</li>
            </>
          )}
        </ol>
        <p className="install-steps-note">Then open Magpie from your home screen — it runs full-screen, like a real app.</p>
        <div className="capture-guide-source-actions">
          <button type="button" className="primary-button" onClick={onClose}>Got it</button>
        </div>
      </section>
    </div>
  );
}
