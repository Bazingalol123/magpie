import { ExternalLink } from "lucide-react";
import { isHttpUrl } from "../lib/parsing.js";
import { hostFromUrl } from "../lib/text.js";

export default function FieldValue({ value }) {
  if (!isHttpUrl(value)) return <span dir="auto">{String(value)}</span>;
  const url = String(value).trim();
  return (
    <a className="field-link" href={url} target="_blank" rel="noreferrer" title={url} onClick={(event) => event.stopPropagation()}>
      {hostFromUrl(url)} <ExternalLink size={11} />
    </a>
  );
}
