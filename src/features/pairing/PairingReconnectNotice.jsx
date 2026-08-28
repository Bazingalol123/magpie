import { AlertTriangle, LoaderCircle } from "lucide-react";
import { PairingIcon } from "../../components/icons.jsx";

export default function PairingReconnectNotice({ onManage, onPair, isPairing }) {
  return (
    <div className="pairing-reconnect-notice" role="status">
      <span className="pairing-reconnect-icon"><AlertTriangle size={17} /></span>
      <div><b>Your browser connection needs attention.</b><span>Every saved Extension token is revoked. Reconnect to capture from Chrome again.</span></div>
      <button type="button" className="secondary-button" onClick={onManage}>View browsers</button>
      <button type="button" className="primary-button" onClick={onPair} disabled={isPairing}>{isPairing ? <LoaderCircle className="spin" size={14} /> : <PairingIcon size={14} />} Reconnect</button>
    </div>
  );
}
