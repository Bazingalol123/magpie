import { useEffect, useState } from "react";

// A spinner alone reads as stuck once a wait crosses a few seconds. Cycling
// through text that names plausible real work (rather than a fake progress
// bar, which is misleading for a genuinely indeterminate wait) keeps a
// 10+ second operation — a slow source fetch, a multi-tool Agent turn —
// reading as "working" instead of "broken."
export function useStagedMessage(active, stages, intervalMs = 3500) {
  const [index, setIndex] = useState(0);
  useEffect(() => {
    if (!active) {
      setIndex(0);
      return undefined;
    }
    const id = setInterval(() => {
      setIndex((current) => Math.min(current + 1, stages.length - 1));
    }, intervalMs);
    return () => clearInterval(id);
  }, [active, stages, intervalMs]);
  return stages[Math.min(index, stages.length - 1)];
}
