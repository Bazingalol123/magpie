import { useState } from "react";
import { LoaderCircle, Plus, Trash2, X } from "lucide-react";
import { PairingIcon } from "../../components/icons.jsx";
import { derivePairingDisplayStatus } from "../../pairing-lifecycle.js";
import { formatDate, relativeDate } from "../../lib/dates.js";
import { EXTENSION_RELEASES_URL, PAIRING_STATUS_COPY } from "../../lib/constants.js";

export default function PairingManagementDialog({ pairings, onClose, onPair, isPairing, onRevoke, onRevokeAll, revokingId, isRevokingAll, error }) {
  const [confirmingId, setConfirmingId] = useState(null);
  const [confirmAll, setConfirmAll] = useState(false);
  const activeCount = pairings.filter((pairing) => pairing.active !== false).length;

  const revokeOne = async (id) => {
    if (await onRevoke(id)) setConfirmingId(null);
  };
  const revokeAll = async () => {
    if (await onRevokeAll()) setConfirmAll(false);
  };

  return (
    <div className="detail-overlay pairing-overlay" role="presentation" onMouseDown={onClose}>
      <section className="pairing-dialog pairing-management-dialog" role="dialog" aria-modal="true" aria-label="Connected browsers" onMouseDown={(event) => event.stopPropagation()}>
        <div className="detail-head">
          <div><div className="eyebrow"><PairingIcon size={13} /> extension access</div><h2>Connected browsers</h2></div>
          <button className="icon-button" onClick={onClose} aria-label="Close"><X size={19} /></button>
        </div>
        <p>Each browser has its own write-only token. Creating a new connection never disconnects another browser.</p>
        {error && <div className="review-error pairing-management-error">{error}</div>}
        <div className="pairing-management-list">
          {pairings.length === 0 && <div className="pairing-empty"><PairingIcon size={22} /><div><b>No browsers paired</b><span>Pair the Chrome Extension on your computer to start capturing from the web. Don't have it yet? <a href={EXTENSION_RELEASES_URL} target="_blank" rel="noreferrer">Download the extension</a>.</span></div></div>}
          {pairings.map((install) => {
            const status = derivePairingDisplayStatus(install);
            const copy = PAIRING_STATUS_COPY[status];
            const isConfirming = confirmingId === install.id;
            const isBusy = revokingId === install.id;
            return (
              <article className={`pairing-install is-${status}`} key={install.id}>
                <div className="pairing-install-main">
                  <span className="pairing-install-icon"><PairingIcon size={18} /></span>
                  <div>
                    <div className="pairing-install-title"><b>{install.label}</b><span>{copy.label}</span></div>
                    <p>{copy.detail}</p>
                    <div className="pairing-install-meta"><span>Created {formatDate(install.created_at)}</span><span>Last used {relativeDate(install.last_used_at)}</span></div>
                  </div>
                </div>
                {install.active !== false && !isConfirming && <button type="button" className="text-button danger-text" onClick={() => setConfirmingId(install.id)} disabled={!!revokingId || isRevokingAll}>Revoke</button>}
                {isConfirming && (
                  <div className="pairing-inline-confirm">
                    <span>This browser will stop capturing immediately.</span>
                    <button type="button" className="secondary-button" onClick={() => setConfirmingId(null)} disabled={isBusy}>Cancel</button>
                    <button type="button" className="danger-button" onClick={() => revokeOne(install.id)} disabled={isBusy}>{isBusy ? <LoaderCircle className="spin" size={14} /> : <Trash2 size={14} />} Confirm revoke</button>
                  </div>
                )}
              </article>
            );
          })}
        </div>
        <div className="pairing-management-actions">
          <button type="button" className="primary-button" onClick={onPair} disabled={isPairing || !!revokingId || isRevokingAll}>{isPairing ? <LoaderCircle className="spin" size={14} /> : <Plus size={14} />} Pair another browser</button>
          {activeCount > 0 && !confirmAll && <button type="button" className="text-button danger-text" onClick={() => setConfirmAll(true)} disabled={!!revokingId || isRevokingAll}>Revoke every browser</button>}
          {activeCount > 0 && confirmAll && (
            <div className="pairing-revoke-all-confirm">
              <span>All {activeCount} active browser{activeCount === 1 ? "" : "s"} will need to reconnect.</span>
              <button type="button" className="secondary-button" onClick={() => setConfirmAll(false)} disabled={isRevokingAll}>Cancel</button>
              <button type="button" className="danger-button" onClick={revokeAll} disabled={isRevokingAll}>{isRevokingAll ? <LoaderCircle className="spin" size={14} /> : <Trash2 size={14} />} Revoke all</button>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
