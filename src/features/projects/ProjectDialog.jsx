import { useState } from "react";
import { LoaderCircle, Plus, Target, X } from "lucide-react";

export default function ProjectDialog({ onClose, onCreate, isCreating }) {
  const [form, setForm] = useState({ title: "", goal: "", template: "custom", criteria: "" });
  const update = (event) => setForm((current) => ({ ...current, [event.target.name]: event.target.value }));
  const submit = (event) => {
    event.preventDefault();
    onCreate(form);
  };
  return (
    <div className="detail-overlay pairing-overlay" role="presentation" onMouseDown={onClose}>
      <form className="pairing-dialog mission-dialog" onSubmit={submit} onMouseDown={(event) => event.stopPropagation()}>
        <div className="detail-head"><div><div className="eyebrow"><Target size={13} /> new project</div><h2>What are you working toward?</h2></div><button className="icon-button" type="button" onClick={onClose} aria-label="Close"><X size={19} /></button></div>
        <p>A Project gives Magpie optional context for a focused search or decision. Auto-organization still chooses the right Collections.</p>
        <label>Project name<input name="title" placeholder="Choose my next work laptop" value={form.title} onChange={update} required /></label>
        <label>Starter template<select name="template" value={form.template} onChange={update}><option value="custom">Custom decision</option><option value="product">Product comparison</option><option value="apartment">Apartment search</option><option value="job">Job opportunities</option></select></label>
        <label>Outcome<textarea name="goal" placeholder="I need a lightweight laptop under $1,500 with excellent battery life." value={form.goal} onChange={update} rows="3" /></label>
        <label>Criteria and constraints<textarea name="criteria" placeholder="Budget is a hard limit. At least 16GB RAM. Prefer under 1.4kg." value={form.criteria} onChange={update} rows="3" /></label>
        <div className="pairing-actions"><span>You can keep multiple Projects active.</span><button className="primary-button" disabled={isCreating}>{isCreating ? <LoaderCircle className="spin" size={15} /> : <Plus size={15} />} Create Project</button></div>
      </form>
    </div>
  );
}
