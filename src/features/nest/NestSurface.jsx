import NestCard from "./NestCard.jsx";
import CaptureSourceOffer from "./CaptureSourceOffer.jsx";

export default function NestSurface({ clips, decisionsByClip, collections, allClips, isFirstRun, hasPairedExtension, resolvingClipId, resolveError, onResolve, onOpenAdvanced, onPair, isPairing, onOpenLibrary, onOpenGuide, onShowInstallHelp }) {
  const recentAutoFiled = allClips.filter((clip) => clip.routing_status !== "needs_review" && Date.now() - new Date(clip.captured_at || clip.created_date).getTime() < 60 * 60 * 1000).length;
  return (
    <section className="workspace-surface nest-surface">
      <header className="surface-header"><div><div className="eyebrow">needs your decision</div><h1>Nest</h1><p>{clips.length ? `${clips.length} capture${clips.length === 1 ? "" : "s"} Magpie wouldn't guess about. Everything it was sure of is already filed.` : "Nothing is waiting. Confident captures file straight into the Library."}</p></div><span className="surface-count">{clips.length}</span></header>
      {resolveError && <div className="error-banner">{resolveError}</div>}
      {clips.length ? <><div className="mobile-triage-progress"><span>1 of {clips.length}</span><span>Swipe right to keep · left to re-route</span></div><div className="nest-list">{clips.map((clip) => <NestCard key={clip.id} clip={clip} decision={decisionsByClip.get(clip.id)} collections={collections} onResolve={onResolve} onOpenAdvanced={onOpenAdvanced} isBusy={resolvingClipId === clip.id} />)}</div></> : <CaptureSourceOffer isFirstRun={isFirstRun} hasPairedExtension={hasPairedExtension} onPair={onPair} isPairing={isPairing} onOpenLibrary={onOpenLibrary} onOpenGuide={onOpenGuide} onShowInstallHelp={onShowInstallHelp} />}
      {recentAutoFiled > 0 && <p className="nest-auto-filed"><span className="live-dot" /> {recentAutoFiled} more capture{recentAutoFiled === 1 ? "" : "s"} arrived and filed {recentAutoFiled === 1 ? "itself" : "themselves"}. {recentAutoFiled === 1 ? "It's" : "They're"} in the Library, not here.</p>}
    </section>
  );
}
