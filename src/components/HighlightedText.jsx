export default function HighlightedText({ text, query }) {
  const clean = String(query || "").trim();
  if (!clean) return <>{text}</>;
  const terms = clean.split(/\s+/).filter((term) => term.length > 1 && !/^(under|below|over|above|at|least|most|max|min)$/i.test(term));
  if (!terms.length) return <>{text}</>;
  const expression = new RegExp(`(${terms.map((term) => term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`, "ig");
  return <>{String(text).split(expression).map((part, index) => terms.some((term) => part.toLowerCase() === term.toLowerCase()) ? <mark key={index}>{part}</mark> : part)}</>;
}
