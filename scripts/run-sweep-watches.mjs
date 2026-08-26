import { createClient } from "@base44/sdk";

// Base44 rejects functions.invoke() made against the shared platform domain
// once an app has a connected custom domain (see src/api/base44Client.js) --
// this must be the app's own origin, same as the extension's ingest URL
// (base44/shared/auth.ts's NEW_PAIRING_INGEST_ORIGIN).
const APP_ORIGIN = "https://magpiecapture.com";

const appId = process.env.BASE44_APP_ID;
const email = process.env.SWEEP_ADMIN_EMAIL;
const password = process.env.SWEEP_ADMIN_PASSWORD;
const limit = process.env.SWEEP_WATCH_LIMIT;

if (!appId || !email || !password) {
  console.error("BASE44_APP_ID, SWEEP_ADMIN_EMAIL, and SWEEP_ADMIN_PASSWORD must all be set");
  process.exit(2);
}

const base44 = createClient({ appId, serverUrl: APP_ORIGIN, appBaseUrl: APP_ORIGIN });

// A run hung on one of these two calls for 33+ minutes with no error
// (2026-08-25) -- neither the SDK nor a bare `fetch` times out on its own,
// so a stalled request just runs forever otherwise. This gives a clear,
// attributable error instead of relying on the workflow's outer
// timeout-minutes to eventually kill it with no diagnostic.
function withTimeout(promise, label, ms = 60_000) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms)),
  ]);
}

await withTimeout(base44.auth.loginViaEmailPassword(email, password), "loginViaEmailPassword");

const response = await withTimeout(
  base44.functions.invoke("sweep-watches", limit ? { limit: Number(limit) } : {}),
  "functions.invoke(sweep-watches)",
);
const result = response?.data;

if (!result || typeof result.processed !== "number" || !Array.isArray(result.results)) {
  throw new Error("sweep-watches returned an invalid response");
}

console.log(`sweep-watches processed ${result.processed} watch(es)`);
for (const entry of result.results ?? []) {
  console.log(` - ${entry.watch_id}: ${entry.outcome ?? "?"}${entry.auto_paused ? " (auto-paused)" : ""}`);
}

const failed = (result.results ?? []).filter((entry) => entry.outcome === "failed");
if (failed.length) {
  console.error(`${failed.length} watch(es) hit an unexpected failure this run`);
  process.exitCode = 1;
}
