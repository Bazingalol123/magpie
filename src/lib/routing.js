import { Inbox, Layers3, Radio, Search } from "lucide-react";

export const WORKSPACE_VIEWS = [
  { id: "nest", label: "Nest", icon: Inbox },
  { id: "library", label: "Library", icon: Layers3 },
  { id: "signals", label: "Signals", icon: Radio },
  { id: "search", label: "Search", icon: Search },
];

export function workspaceViewFromPath(pathname) {
  const segment = pathname.split("/").filter(Boolean)[0];
  return WORKSPACE_VIEWS.some((view) => view.id === segment) ? segment : "library";
}

export function readShareDraft() {
  const params = new URLSearchParams(window.location.search);
  const direct = { url: params.get("url") || "", text: params.get("text") || "", title: params.get("title") || "" };
  if (direct.url || direct.text || direct.title) {
    try { sessionStorage.setItem("magpie.share.draft", JSON.stringify(direct)); } catch { /* storage can be unavailable */ }
    return direct;
  }
  try { return JSON.parse(sessionStorage.getItem("magpie.share.draft") || "null") || direct; } catch { return direct; }
}
