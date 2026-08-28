export function formatDate(value) {
  if (!value) return "Not yet";
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

export function relativeDate(value) {
  if (!value) return "not yet";
  const delta = Date.now() - new Date(value).getTime();
  if (!Number.isFinite(delta)) return formatDate(value);
  const minutes = Math.max(0, Math.round(delta / 60_000));
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return days < 14 ? `${days}d ago` : formatDate(value);
}
