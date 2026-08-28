import { useState } from "react";
import { hostFromUrl } from "../lib/text.js";

// Real favicons read as a real product tracking real sites; the letter
// square is only a fallback for hosts a favicon service can't resolve.
export default function SourceFavicon({ url, large }) {
  const host = hostFromUrl(url);
  const hasHost = Boolean(host) && host !== "source page";
  const [failed, setFailed] = useState(false);
  const sizeClass = large ? " source-favicon-lg" : "";
  if (!hasHost || failed) {
    return <span className={`source-favicon${sizeClass}`}>{hasHost ? host.charAt(0).toUpperCase() : "?"}</span>;
  }
  return (
    <img
      className={`source-favicon is-image${sizeClass}`}
      src={`https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=64`}
      alt=""
      loading="lazy"
      onError={() => setFailed(true)}
    />
  );
}
