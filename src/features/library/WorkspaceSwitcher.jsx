import { useEffect, useState } from "react";
import { Check, ChevronDown, Layers3, LoaderCircle, Plus, Target, Trash2 } from "lucide-react";

export default function WorkspaceSwitcher({ missions, activeMissionId, onSelect, onNewProject, onDelete, deletingId, collections, records, watchRules }) {
  const [isOpen, setIsOpen] = useState(false);
  const [confirmingId, setConfirmingId] = useState(null);
  const active = missions.find((mission) => mission.id === activeMissionId);

  useEffect(() => {
    if (!isOpen) setConfirmingId(null);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return undefined;
    const onPointerDown = (event) => {
      if (!event.target.closest?.(".workspace-switcher")) setIsOpen(false);
    };
    const onKeyDown = (event) => {
      if (event.key === "Escape") {
        setIsOpen(false);
        document.querySelector(".workspace-switcher > button")?.focus();
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [isOpen]);

  const onMenuKeyDown = (event) => {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    event.preventDefault();
    const items = [...event.currentTarget.querySelectorAll("button")];
    const index = items.indexOf(document.activeElement);
    const next = event.key === "ArrowDown"
      ? items[Math.min(index + 1, items.length - 1)] ?? items[0]
      : items[Math.max(index - 1, 0)] ?? items[0];
    next?.focus();
  };

  const choose = (missionId) => {
    setIsOpen(false);
    onSelect(missionId);
  };

  return (
    <div className="workspace-switcher">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={isOpen}
        onClick={() => setIsOpen((current) => !current)}
      >
        <h1>{active ? active.title : "Your collections"}</h1>
        <ChevronDown size={22} aria-hidden="true" />
      </button>
      {isOpen && (
        <div className="workspace-menu" role="menu" aria-label="Switch workspace" onKeyDown={onMenuKeyDown}>
          <button role="menuitem" className={active ? "" : "current"} onClick={() => choose("")}>
            <Layers3 size={14} /> Library — all Collections {!active && <Check size={14} />}
          </button>
          {missions.map((mission) => {
            const isConfirming = confirmingId === mission.id;
            const isDeleting = deletingId === mission.id;
            const missionCollections = collections.filter((collection) => collection.mission_id === mission.id);
            const missionCollectionIds = new Set(missionCollections.map((collection) => collection.id));
            const missionRecords = records.filter((record) => record.mission_id === mission.id || missionCollectionIds.has(record.collection_id));
            const missionRecordIds = new Set(missionRecords.map((record) => record.id));
            const missionWatches = watchRules.filter((watch) => missionRecordIds.has(watch.record_id));
            const collectionCount = missionCollections.length;
            const itemCount = missionRecords.length;
            const watchCount = missionWatches.length;
            return (
              <div className="workspace-menu-row" key={mission.id}>
                <button role="menuitem" className={mission.id === activeMissionId ? "current" : ""} onClick={() => choose(mission.id)}>
                  <Target size={14} /> {mission.title} {mission.id === activeMissionId && <Check size={14} />}
                </button>
                {isConfirming ? (
                  <span className="workspace-menu-confirm">
                    <span><b>Delete {mission.title} permanently?</b> {collectionCount} Collection{collectionCount === 1 ? "" : "s"}, {itemCount} Item{itemCount === 1 ? "" : "s"}, and {watchCount} Watch{watchCount === 1 ? "" : "es"} will be removed with their captures and history. You'll return to Library.</span>
                    <button
                      type="button"
                      className="danger-button danger-button-compact"
                      onClick={() => { onDelete(mission.id); setConfirmingId(null); }}
                      disabled={isDeleting}
                      aria-label={`Confirm delete ${mission.title}`}
                    >
                      {isDeleting ? <LoaderCircle className="spin" size={12} /> : <Trash2 size={12} />}
                    </button>
                    <button type="button" className="text-button" onClick={() => setConfirmingId(null)} disabled={isDeleting}>Cancel</button>
                  </span>
                ) : (
                  <button
                    type="button"
                    className="icon-button"
                    onClick={() => setConfirmingId(mission.id)}
                    aria-label={`Delete ${mission.title}`}
                  >
                    <Trash2 size={13} />
                  </button>
                )}
              </div>
            );
          })}
          <div className="workspace-menu-divider" role="separator" />
          <button role="menuitem" onClick={() => { setIsOpen(false); onNewProject(); }}>
            <Plus size={14} /> New Project
          </button>
        </div>
      )}
    </div>
  );
}
