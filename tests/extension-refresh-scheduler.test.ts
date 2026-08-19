import { assert, assertEquals } from "jsr:@std/assert";
import {
  nextRefreshAt,
  normalizeRefreshEntry,
  PROACTIVE_DOMAIN_COOLDOWN_MS,
  PROACTIVE_REFRESH_INTERVAL_MS,
  removeSavedUrl,
  selectDueRefresh,
} from "../extension/refresh-scheduler.js";

Deno.test("new saved URLs are delayed until the first proactive interval", () => {
  const now = 1_000_000;
  const entry = normalizeRefreshEntry({}, now);
  assertEquals(entry.lastOutcome, "never");
  assertEquals(entry.nextRefreshAt, now + PROACTIVE_REFRESH_INTERVAL_MS);
});

Deno.test("selectDueRefresh chooses one due URL and respects the domain cooldown", () => {
  const now = 10_000_000;
  const due = now - 1;
  const savedUrls = {
    "https://shop.example/item-a": { nextRefreshAt: due, lastRefreshAt: 0, refreshPriority: "normal" },
    "https://shop.example/item-b": { nextRefreshAt: due, lastRefreshAt: now - 10_000 },
    "https://other.example/item": { nextRefreshAt: due, lastRefreshAt: 0, refreshPriority: "high" },
  };

  const selected = selectDueRefresh(savedUrls, now);
  assertEquals(selected?.url, "https://other.example/item");
  assertEquals(selectDueRefresh({
    "https://shop.example/item-a": { nextRefreshAt: due, lastRefreshAt: now - PROACTIVE_DOMAIN_COOLDOWN_MS + 1 },
  }, now), null);
});

Deno.test("failed attempts back off but remain bounded", () => {
  const now = 20_000_000;
  assertEquals(nextRefreshAt(now, 0), now + PROACTIVE_REFRESH_INTERVAL_MS);
  assert(nextRefreshAt(now, 3) > nextRefreshAt(now, 1));
  assert(nextRefreshAt(now, 20) - now <= 24 * 60 * 60 * 1_000);
});

Deno.test("no-match cleanup removes only the orphaned saved URL", () => {
  const savedUrls = {
    "https://example.test/deleted": { lastRefreshAt: 1 },
    "https://example.test/kept": { lastRefreshAt: 2 },
  };
  const remaining = removeSavedUrl(savedUrls, "https://example.test/deleted");
  assertEquals(Object.keys(remaining), ["https://example.test/kept"]);
  assertEquals(Object.keys(savedUrls), ["https://example.test/deleted", "https://example.test/kept"]);
});
