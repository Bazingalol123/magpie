export const PROACTIVE_REFRESH_ALARM = "magpie:proactive-refresh";
export const PROACTIVE_REFRESH_PERIOD_MINUTES = 15;
export const PROACTIVE_REFRESH_INTERVAL_MS = 6 * 60 * 60 * 1_000;
export const PROACTIVE_DOMAIN_COOLDOWN_MS = 60 * 60 * 1_000;
export const PROACTIVE_MAX_FAILURE_BACKOFF_MS = 24 * 60 * 60 * 1_000;
export const PROACTIVE_MAX_REMEMBERED_URLS = 500;

export function normalizeRefreshEntry(entry = {}, now = Date.now()) {
  const lastRefreshAt = finiteTimestamp(entry.lastRefreshAt);
  const nextRefreshAt = finiteTimestamp(entry.nextRefreshAt);
  return {
    lastRefreshAt,
    nextRefreshAt: nextRefreshAt || (lastRefreshAt ? lastRefreshAt + PROACTIVE_REFRESH_INTERVAL_MS : now + PROACTIVE_REFRESH_INTERVAL_MS),
    lastOutcome: typeof entry.lastOutcome === "string" ? entry.lastOutcome : "never",
    failureCount: Math.max(Number(entry.failureCount) || 0, 0),
    lastSuccessAt: finiteTimestamp(entry.lastSuccessAt),
    refreshPriority: entry.refreshPriority === "high" || entry.refreshPriority === "low" ? entry.refreshPriority : "normal",
  };
}

export function selectDueRefresh(savedUrls, now = Date.now()) {
  const entries = Object.entries(savedUrls ?? {})
    .map(([url, rawEntry]) => ({ url, entry: normalizeRefreshEntry(rawEntry, now) }))
    .filter(({ url, entry }) => isHttpUrl(url) && entry.nextRefreshAt <= now && now - entry.lastRefreshAt >= PROACTIVE_DOMAIN_COOLDOWN_MS);

  entries.sort((left, right) => {
    const priorityDelta = priorityValue(right.entry.refreshPriority) - priorityValue(left.entry.refreshPriority);
    return priorityDelta || left.entry.nextRefreshAt - right.entry.nextRefreshAt || left.url.localeCompare(right.url);
  });

  for (const candidate of entries) {
    const domainBusy = Object.entries(savedUrls ?? {}).some(([url, rawEntry]) => {
      if (url === candidate.url || !sameDomain(url, candidate.url)) return false;
      const lastRefreshAt = finiteTimestamp(rawEntry?.lastRefreshAt);
      return lastRefreshAt > 0 && now - lastRefreshAt < PROACTIVE_DOMAIN_COOLDOWN_MS;
    });
    if (!domainBusy) return candidate;
  }
  return null;
}

export function removeSavedUrl(savedUrls, url) {
  const next = { ...(savedUrls ?? {}) };
  delete next[url];
  return next;
}

export function nextRefreshAt(now, failureCount = 0) {
  const backoff = failureCount > 0
    ? Math.min(PROACTIVE_REFRESH_INTERVAL_MS * (2 ** Math.min(failureCount - 1, 2)), PROACTIVE_MAX_FAILURE_BACKOFF_MS)
    : PROACTIVE_REFRESH_INTERVAL_MS;
  return now + backoff;
}

export function isHttpUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function sameDomain(left, right) {
  try {
    return new URL(left).hostname === new URL(right).hostname;
  } catch {
    return false;
  }
}

function priorityValue(value) {
  return value === "high" ? 2 : value === "low" ? 0 : 1;
}

function finiteTimestamp(value) {
  const timestamp = Number(value);
  return Number.isFinite(timestamp) && timestamp > 0 ? timestamp : 0;
}
