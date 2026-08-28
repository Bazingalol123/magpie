import { useState } from "react";
import { LoaderCircle, Plus, ShieldCheck } from "lucide-react";
import { isSafeHttpUrl } from "./lib/parsing.js";
import { hostFromUrl } from "./lib/text.js";

export default function ShareCapturePage({ draft, onSubmit, isSubmitting, error, result }) {
  const [note, setNote] = useState(draft.text || draft.title || "");
  const [intent, setIntent] = useState("reference");
  const submit = async (event) => {
    event.preventDefault();
    await onSubmit({ source_url: draft.url, raw_text: note, capture_intent: intent });
  };
  return (
    <main className="share-capture-shell">
      <section className="share-capture-card">
        <div className="eyebrow"><ShieldCheck size={13} /> shared with Magpie</div>
        <h1>Save this for later.</h1>
        <p>Magpie received this page from your phone. Add a short note and we’ll organize it in your workspace.</p>
        <div className="share-source"><span>Source</span>{isSafeHttpUrl(draft.url) ? <a href={draft.url} target="_blank" rel="noreferrer">{hostFromUrl(draft.url)}</a> : <span>{draft.url || "Shared content"}</span>}</div>
        <form className="mobile-capture-form" onSubmit={submit}>
          <label>Why does this matter?<textarea value={note} onChange={(event) => setNote(event.target.value)} placeholder="What should Magpie remember?" rows="4" required /></label>
          <label>Intent<select value={intent} onChange={(event) => setIntent(event.target.value)}><option value="reference">Keep for reference</option><option value="compare">Compare later</option><option value="watch">Watch for changes</option><option value="act">Act on this</option></select></label>
          {error && <div className="review-error">{error}</div>}
          {result && <div className="refresh-notice success">{result.duplicate ? "Already saved in your workspace." : result.routing_status === "needs_review" ? "Saved to Nest." : "Saved. Magpie is organizing it now."}</div>}
          <button className="primary-button" type="submit" disabled={isSubmitting}>{isSubmitting ? <LoaderCircle className="spin" size={15} /> : <Plus size={15} />} {isSubmitting ? "Saving…" : "Save to Magpie"}</button>
        </form>
      </section>
    </main>
  );
}
