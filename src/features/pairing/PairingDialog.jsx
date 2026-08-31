import { useState } from "react";
import { Copy, Download, ShieldCheck, X } from "lucide-react";
import { PairingIcon } from "../../components/icons.jsx";
import { EXTENSION_RELEASES_URL } from "../../lib/constants.js";

export default function PairingDialog({ pairing, onClose }) {
  const [copied, setCopied] = useState("");

  const copy = async (value, label) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(label);
    } catch {
      setCopied("Select and copy manually");
    }
  };

  return (
    <div className="detail-overlay pairing-overlay" role="presentation" onMouseDown={onClose}>
      <section className="pairing-dialog" role="dialog" aria-modal="true" aria-label="Pair Magpie extension" onMouseDown={(event) => event.stopPropagation()}>
        <div className="detail-head">
          <div><div className="eyebrow"><PairingIcon size={13} /> browser pairing</div><h2>Connect this extension</h2></div>
          <button className="icon-button" onClick={onClose} aria-label="Close"><X size={19} /></button>
        </div>
        <p>Paste both values into the Magpie extension's side panel <b>on your computer</b> — the extension only runs on desktop Chrome, whatever device you generated this pairing from. Keep this window open: it closes automatically once the extension uses them.</p>
        <div className="pairing-value"><span>Ingest function URL</span><code>{pairing.ingest_url}</code><button onClick={() => copy(pairing.ingest_url, "URL copied")}><Copy size={14} /> Copy</button></div>
        <div className="pairing-value token"><span>Paired extension token</span><code>{pairing.token}</code><button onClick={() => copy(pairing.token, "Token copied")}><Copy size={14} /> Copy</button></div>
        <div className="pairing-note"><ShieldCheck size={16} /> This token can only submit clips to your library. It cannot read anything from Magpie.</div>
        <div className="pairing-note"><Download size={16} /> Don't have the extension yet? <a href={EXTENSION_RELEASES_URL} target="_blank" rel="noreferrer">Download it</a> on your computer, then paste these values into its side panel.</div>
        <div className="pairing-actions"><span>{copied || "Waiting for the extension…"}</span><button className="secondary-button" onClick={onClose}>Finish later</button></div>
      </section>
    </div>
  );
}
