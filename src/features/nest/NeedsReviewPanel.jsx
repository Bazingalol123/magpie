import { useEffect, useState } from "react";
import { AlertTriangle, ArrowRightLeft, ExternalLink, FolderPlus, Inbox, LoaderCircle, Plus, Trash2, Wand2, X } from "lucide-react";
import { parseJson, isHttpUrl } from "../../lib/parsing.js";
import { hostFromUrl } from "../../lib/text.js";
import { reasonLabel } from "../../lib/reviewCopy.js";
import CapturedContext from "../../components/CapturedContext.jsx";

export default function NeedsReviewPanel({ clips, decisionsByClip, collections, missions, selectedClipId, onSelectClip, onClose, onResolve, onCreateProject, resolvingClipId, resolveError }) {
  const selectedClip = clips.find((clip) => clip.id === selectedClipId) ?? clips[0] ?? null;
  const decision = selectedClip ? decisionsByClip.get(selectedClip.id) : null;
  const suggestedSchema = parseJson(decision?.suggested_schema_json, []);
  const reasonCodes = parseJson(decision?.reason_codes_json, []);

  const [redirectId, setRedirectId] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [createName, setCreateName] = useState("");
  const [createFields, setCreateFields] = useState([{ name: "", type: "string" }, { name: "", type: "string" }]);
  const [createProjectId, setCreateProjectId] = useState("");
  const [newProjectTitle, setNewProjectTitle] = useState("");
  const [isSavingProject, setIsSavingProject] = useState(false);
  const [projectError, setProjectError] = useState("");
  const [isConfirmingDismiss, setIsConfirmingDismiss] = useState(false);

  useEffect(() => {
    setRedirectId("");
    setIsCreating(false);
    setCreateName(decision?.suggested_name || "");
    setCreateFields(
      suggestedSchema.length
        ? suggestedSchema.map((field) => ({ name: field.name, type: field.type || "string" }))
        : [{ name: "", type: "string" }, { name: "", type: "string" }],
    );
    setCreateProjectId(selectedClip?.mission_id || "");
    setNewProjectTitle("");
    setProjectError("");
    setIsConfirmingDismiss(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedClip?.id]);

  const saveNewProject = async () => {
    const title = newProjectTitle.trim();
    if (!title) return;
    setIsSavingProject(true);
    setProjectError("");
    try {
      const mission = await onCreateProject(title);
      setCreateProjectId(mission.id);
      setNewProjectTitle("");
    } catch (error) {
      setProjectError(error.response?.data?.error || error.message || "Could not create the Project.");
    } finally {
      setIsSavingProject(false);
    }
  };

  const isBusy = resolvingClipId === selectedClip?.id;
  const updateField = (index, patch) => {
    setCreateFields((current) => current.map((field, i) => (i === index ? { ...field, ...patch } : field)));
  };
  const addField = () => setCreateFields((current) => (current.length < 8 ? [...current, { name: "", type: "string" }] : current));
  const removeField = (index) => setCreateFields((current) => current.filter((_, i) => i !== index));

  if (!selectedClip) {
    return (
      <div className="detail-overlay" role="presentation" onMouseDown={onClose}>
        <aside className="detail-panel review-panel" role="dialog" aria-modal="true" aria-label="Nest" onMouseDown={(event) => event.stopPropagation()}>
          <div className="detail-head">
            <div><div className="eyebrow"><Inbox size={13} /> nest</div><h2>Nothing waiting</h2></div>
            <button className="icon-button" onClick={onClose} aria-label="Close"><X size={19} /></button>
          </div>
          <p className="review-empty">Every capture is organized. New ambiguous captures will appear here.</p>
        </aside>
      </div>
    );
  }

  return (
    <div className="detail-overlay" role="presentation" onMouseDown={onClose}>
      <aside className="detail-panel review-panel" role="dialog" aria-modal="true" aria-label="Nest" onMouseDown={(event) => event.stopPropagation()}>
        <div className="detail-head">
          <div><div className="eyebrow"><Inbox size={13} /> nest · {clips.length}</div><h2>Organize this capture</h2></div>
          <button className="icon-button" onClick={onClose} aria-label="Close"><X size={19} /></button>
        </div>

        {clips.length > 1 && (
          <div className="review-list">
            {clips.map((clip) => (
              <button key={clip.id} className={`review-list-item ${clip.id === selectedClip.id ? "active" : ""}`} onClick={() => onSelectClip(clip.id)}>
                {hostFromUrl(clip.source_url)}
              </button>
            ))}
          </div>
        )}

        {isHttpUrl(selectedClip.source_url) && <a className="source-link" href={selectedClip.source_url} target="_blank" rel="noreferrer"><ExternalLink size={14} /> {hostFromUrl(selectedClip.source_url)}</a>}
        <CapturedContext clip={selectedClip} />

        <div className="review-reasons">
          {(reasonCodes.length ? reasonCodes : [selectedClip.routing_reason_code]).filter(Boolean).map((code) => (
            <div className="review-reason" key={code}><AlertTriangle size={13} /> {reasonLabel(code)}</div>
          ))}
          {typeof decision?.confidence === "number" && <div className="review-confidence">Confidence {Math.round(decision.confidence * 100)}%</div>}
        </div>

        {resolveError && <div className="review-error">{resolveError}</div>}

        <div className="review-actions">
          {decision?.suggested_name && (
            <button
              className="primary-button review-accept"
              disabled={isBusy}
              onClick={() => onResolve(selectedClip.id, { action: "accept", clip_id: selectedClip.id })}
            >
              {isBusy ? <LoaderCircle className="spin" size={15} /> : <Wand2 size={15} />} Accept: create "{decision.suggested_name}"
            </button>
          )}

          <div className="review-redirect">
            <select value={redirectId} onChange={(event) => setRedirectId(event.target.value)}>
              <option value="">Move to existing Collection…</option>
              {collections.map((collection) => <option value={collection.id} key={collection.id}>{collection.name}</option>)}
            </select>
            <button
              className="secondary-button"
              disabled={!redirectId || isBusy}
              onClick={() => onResolve(selectedClip.id, { action: "redirect", clip_id: selectedClip.id, collection_id: redirectId })}
            >
              <ArrowRightLeft size={14} /> Move
            </button>
          </div>

          <button type="button" className="text-button review-toggle-create" onClick={() => setIsCreating((current) => !current)}>
            <FolderPlus size={14} /> {isCreating ? "Cancel new Collection" : "Create a different Collection"}
          </button>

          {isCreating && (
            <div className="review-create-form">
              <label>Collection name<input value={createName} onChange={(event) => setCreateName(event.target.value)} placeholder="Cameras" /></label>
              <label>Project
                <select value={createProjectId} onChange={(event) => setCreateProjectId(event.target.value)}>
                  <option value="">No Project — global Library</option>
                  {missions.filter((mission) => mission.status === "active").map((mission) => (
                    <option value={mission.id} key={mission.id}>{mission.title}</option>
                  ))}
                  <option value="__new__">New Project…</option>
                </select>
              </label>
              {createProjectId === "__new__" && (
                <div className="review-new-project">
                  <input
                    value={newProjectTitle}
                    onChange={(event) => setNewProjectTitle(event.target.value)}
                    onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); saveNewProject(); } }}
                    placeholder="Project name, e.g. Getting a new camera"
                  />
                  <button type="button" className="secondary-button" onClick={saveNewProject} disabled={isSavingProject || !newProjectTitle.trim()}>
                    {isSavingProject ? <LoaderCircle className="spin" size={13} /> : <Plus size={13} />} Create
                  </button>
                </div>
              )}
              {projectError && <div className="review-error">{projectError}</div>}
              <div className="review-schema-rows">
                {createFields.map((field, index) => (
                  <div className="review-schema-row" key={index}>
                    <input value={field.name} onChange={(event) => updateField(index, { name: event.target.value })} placeholder="field_name" />
                    <select value={field.type} onChange={(event) => updateField(index, { type: event.target.value })}>
                      <option value="string">Text</option>
                      <option value="number">Number</option>
                      <option value="boolean">Yes/No</option>
                    </select>
                    <button type="button" className="icon-button" onClick={() => removeField(index)} aria-label="Remove field"><Trash2 size={14} /></button>
                  </div>
                ))}
              </div>
              {createFields.length < 8 && <button type="button" className="text-button" onClick={addField}><Plus size={13} /> Add field</button>}
              <button
                className="primary-button"
                disabled={isBusy || !createName.trim() || createProjectId === "__new__" || createFields.filter((field) => field.name.trim()).length < 1}
                onClick={() => onResolve(selectedClip.id, {
                  action: "create",
                  clip_id: selectedClip.id,
                  collection_name: createName.trim(),
                  schema: createFields.filter((field) => field.name.trim()).map((field) => ({ name: field.name.trim(), type: field.type })),
                  project_id: createProjectId || undefined,
                })}
              >
                {isBusy ? <LoaderCircle className="spin" size={15} /> : <FolderPlus size={15} />} Create Collection & file this Item
              </button>
            </div>
          )}

          <div className="review-dismiss">
            {isConfirmingDismiss ? (
              <div className="danger-confirm">
                <span>This permanently deletes the capture and its routing history.</span>
                <div>
                  <button className="danger-button" disabled={isBusy} onClick={() => onResolve(selectedClip.id, { action: "dismiss", clip_id: selectedClip.id })}>
                    {isBusy ? <LoaderCircle className="spin" size={13} /> : <Trash2 size={13} />} Dismiss permanently
                  </button>
                  <button className="text-button" onClick={() => setIsConfirmingDismiss(false)} disabled={isBusy}>Keep it</button>
                </div>
              </div>
            ) : (
              <button type="button" className="text-button danger-link" onClick={() => setIsConfirmingDismiss(true)}>
                <Trash2 size={13} /> Dismiss — I don't want this capture
              </button>
            )}
          </div>
        </div>
      </aside>
    </div>
  );
}
