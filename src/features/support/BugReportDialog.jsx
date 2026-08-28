import { useState } from "react";
import { Bug, Check, ExternalLink, LoaderCircle, X } from "lucide-react";
import { isHttpUrl } from "../../lib/parsing.js";

export default function BugReportDialog({ onClose, onSubmit, isSubmitting, error, result }) {
  const [form, setForm] = useState({ title: "", description: "" });
  const update = (event) => setForm((current) => ({ ...current, [event.target.name]: event.target.value }));
  const submit = (event) => {
    event.preventDefault();
    onSubmit(form);
  };

  if (result) {
    return (
      <div className="detail-overlay pairing-overlay" role="presentation" onMouseDown={onClose}>
        <div className="pairing-dialog mission-dialog" onMouseDown={(event) => event.stopPropagation()}>
          <div className="detail-head"><div><div className="eyebrow"><Check size={13} /> report sent</div><h2>Thanks — we've got it.</h2></div><button className="icon-button" type="button" onClick={onClose} aria-label="Close"><X size={19} /></button></div>
          <p>Your report is filed as {isHttpUrl(result.issue_url) ? <a href={result.issue_url} target="_blank" rel="noreferrer">issue #{result.issue_number} <ExternalLink size={12} /></a> : <>issue #{result.issue_number}</>}. No GitHub account needed on your end — we filed it for you.</p>
          <div className="pairing-actions"><span /><button type="button" className="primary-button" onClick={onClose}>Done</button></div>
        </div>
      </div>
    );
  }

  return (
    <div className="detail-overlay pairing-overlay" role="presentation" onMouseDown={onClose}>
      <form className="pairing-dialog mission-dialog" onSubmit={submit} onMouseDown={(event) => event.stopPropagation()}>
        <div className="detail-head"><div><div className="eyebrow"><Bug size={13} /> found a bug</div><h2>What went wrong?</h2></div><button className="icon-button" type="button" onClick={onClose} aria-label="Close"><X size={19} /></button></div>
        <p>This goes straight to the team — you don't need a GitHub account to send it.</p>
        <label>Summary<input name="title" placeholder="Card images look stretched on Collection cards" value={form.title} onChange={update} required minLength={4} maxLength={120} /></label>
        <label>What happened<textarea name="description" placeholder="What you did, what you expected, and what happened instead." value={form.description} onChange={update} rows="4" required minLength={10} maxLength={4000} /></label>
        {error && <div className="error-banner">{error}</div>}
        <div className="pairing-actions"><span>Sent with your account email so we can follow up.</span><button className="primary-button" disabled={isSubmitting}>{isSubmitting ? <LoaderCircle className="spin" size={15} /> : <Bug size={15} />} Send report</button></div>
      </form>
    </div>
  );
}
