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
