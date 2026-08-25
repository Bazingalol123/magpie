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

await base44.auth.loginViaEmailPassword(email, password);

const result = await base44.functions.invoke("sweep-watches", limit ? { limit: Number(limit) } : {});

console.log(`sweep-watches processed ${result.processed} watch(es)`);
for (const entry of result.results ?? []) {
  console.log(` - ${entry.watch_id}: ${entry.outcome ?? "?"}${entry.auto_paused ? " (auto-paused)" : ""}`);
}

const failed = (result.results ?? []).filter((entry) => entry.outcome === "failed");
if (failed.length) {
  console.error(`${failed.length} watch(es) hit an unexpected failure this run`);
  process.exitCode = 1;
}
