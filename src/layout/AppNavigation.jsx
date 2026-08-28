import { Book, Download, LoaderCircle, LockKeyhole, LogOut, MessageCircle, UserRound } from "lucide-react";
import { PairingIcon } from "../components/icons.jsx";
import { WORKSPACE_VIEWS } from "../lib/routing.js";
import { collectionDotStatus } from "../lib/dashboardData.js";
import { EXTENSION_RELEASES_URL } from "../lib/constants.js";
import { searchWorkspace } from "../workspace-search.js";
import MagpieMark from "../components/MagpieMark.jsx";

export default function AppNavigation({ activeView, onNavigate, needsReviewCount, signalCount, collections, activeCollectionId, records, clips, refreshingRecordId, onSelectCollection, user, onPair, onManagePairings, isPairing, hasPairingHistory, hasActiveExtension, onOpenDocs, onSignOut, onAsk, isAskOpen }) {
  const pairingAction = hasPairingHistory ? onManagePairings : onPair;
  const pairingLabel = !hasPairingHistory ? "Pair extension" : hasActiveExtension ? "Connected browsers" : "Reconnect browser";
  return (
    <aside className="app-navigation">
      <button type="button" className="nav-brand" onClick={() => onNavigate("nest")}><MagpieMark size={27} /><span>magpie</span><i>beta</i></button>
      <nav className="primary-nav" aria-label="Workspace">
        {WORKSPACE_VIEWS.map(({ id, label, icon: Icon }) => {
          const count = id === "nest" ? needsReviewCount : id === "signals" ? signalCount : 0;
          return (
            <button type="button" key={id} className={activeView === id ? "active" : ""} onClick={() => onNavigate(id)}>
              <Icon size={16} /><span>{label}</span>{count > 0 && <b>{count}</b>}{id === "search" && <kbd>⌘K</kbd>}
            </button>
          );
        })}
        <button type="button" className={isAskOpen ? "active" : ""} onClick={onAsk}>
          <MessageCircle size={16} /><span>Ask Magpie</span>
        </button>
      </nav>
      <div className="nav-collections">
        <div className="nav-section-label"><span>collections</span><span>{collections.length}</span></div>
        <div className="nav-collection-list">
          {collections.map((collection) => {
            const status = collectionDotStatus(collection, records, refreshingRecordId);
            const count = collection.collection_type === "saved_search"
              ? searchWorkspace({ query: collection.saved_query, records, clips, collections }).items.length
              : records.filter((record) => record.collection_id === collection.id).length;
            return (
              <button type="button" key={collection.id} className={activeView === "library" && activeCollectionId === collection.id ? "active" : ""} onClick={() => onSelectCollection(collection.id)}>
                <span className={`collection-dot${status ? ` is-${status}` : ""}`} />
                <span>{collection.name}</span>
                <small>{count}</small>
              </button>
            );
          })}
        </div>
      </div>
      <div className="nav-account">
        <button type="button" onClick={pairingAction} disabled={isPairing}>{isPairing ? <LoaderCircle className="spin" size={14} /> : <PairingIcon size={14} />} {pairingLabel}</button>
        <button type="button" onClick={onOpenDocs}><Book size={14} /> Docs</button>
        <a href={EXTENSION_RELEASES_URL} target="_blank" rel="noreferrer"><Download size={14} /> Download extension</a>
        <div className="nav-user"><span><UserRound size={14} /> {user.full_name || user.email}</span><button type="button" onClick={onSignOut} aria-label="Sign out"><LogOut size={14} /></button></div>
        <p><LockKeyhole size={12} /> Owner-scoped by design</p>
      </div>
    </aside>
  );
}
