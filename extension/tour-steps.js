// Content only -- tour.js decides which index is active and which variant
// of the last step applies. The extension never knows about
// Records/Collections directly (write-only trust boundary) -- it only knows
// the routing_status its own submission got back, which is enough to tell
// "filed itself" from "needs your decision in Nest" apart honestly.
export function buildExtensionTourSteps(routingStatus) {
  const opened = routingStatus === "needs_review"
    ? {
        title: "One quick decision",
        description: "Captured — Magpie wasn't confident how to file this one. Open the dashboard; it's waiting in Nest for your call.",
      }
    : {
        title: "Open your dashboard",
        description: "Captured. Open the dashboard to see where Magpie filed it.",
      };
  return [
    {
      id: "try-capture",
      selector: "#start-picker",
      title: "Try your first capture",
      description: "Hover any element on the page, then press C to clip it. Or use Snip area / Save page below instead.",
    },
    { id: "open-dashboard", selector: "#open-dashboard", ...opened },
  ];
}
