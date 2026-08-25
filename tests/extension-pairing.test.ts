import { buildIngestUrl } from "../base44/shared/auth.ts";

function assertEquals(actual: unknown, expected: unknown, message: string) {
  const left = JSON.stringify(actual);
  const right = JSON.stringify(expected);
  if (left !== right) throw new Error(`${message}\nexpected: ${right}\nactual:   ${left}`);
}

Deno.test("new pairings receive the custom-domain ingest URL (issue #59)", () => {
  assertEquals(
    buildIngestUrl(),
    "https://magpiecapture.com/api/apps/6a622e254ee5f8740523313e/functions/ingest-clip",
    "create-extension-pairing must return the public custom-domain ingest URL, routed through /api/apps/{app_id}, for new pairings",
  );
});

Deno.test("the ingest URL is routed through Base44's /api/apps/{app_id}/functions prefix", () => {
  const url = buildIngestUrl();
  if (!/^https:\/\/magpiecapture\.com\/api\/apps\/[^/]+\/functions\/ingest-clip$/.test(url)) {
    throw new Error("buildIngestUrl must emit the /api/apps/{app_id}/functions/ingest-clip shape Base44 actually routes -- a bare /functions/ingest-clip path 404s, and the extension's appHeaders() regex (/\\/api\\/apps\\/([^/]+)\\/functions\\//) depends on this prefix to derive the X-App-Id/Base44-App-Id headers");
  }
});

Deno.test("the ingest URL never points at the retired Base44 hostname", () => {
  const url = buildIngestUrl();
  if (url.includes("magpieorelse.base44.app")) {
    throw new Error("new pairings must not receive the old Base44-hosted ingest URL");
  }
});

Deno.test("extension context records a distinct server-side pairing handshake", async () => {
  const schema = await Deno.readTextFile(new URL("../base44/entities/extension-install.jsonc", import.meta.url));
  const entry = await Deno.readTextFile(new URL("../base44/functions/extension-context/entry.ts", import.meta.url));
  if (!schema.includes('"paired_at"')) throw new Error("ExtensionInstall must persist handshake evidence separately from ingestion use");
  if (!entry.includes("pairing.paired_at") || !entry.includes("ExtensionInstall.update")) throw new Error("extension-context must stamp the first authenticated handshake");
  if (!entry.includes("extension_id: pairing.id")) throw new Error("extension-context must identify the authenticated browser without exposing its token hash");
  if (entry.includes("last_used_at")) throw new Error("extension-context must not reinterpret last_used_at as a pairing handshake");
});

Deno.test("a revoked pairing clears only local credentials and directs the browser to reconnect", async () => {
  const worker = await Deno.readTextFile(new URL("../extension/service-worker.js", import.meta.url));
  const panel = await Deno.readTextFile(new URL("../extension/sidepanel.js", import.meta.url));
  const credentialRemoval = 'remove(["extensionToken", "extensionId"])';

  if (!worker.includes("response.status === 403") || !worker.includes(credentialRemoval)) {
    throw new Error("service-worker capture paths must clear revoked pairing credentials on 403");
  }
  if (worker.includes('remove(["extensionToken", "extensionId", "ingestUrl"])')) {
    throw new Error("revocation recovery must preserve ingestUrl so the owner can open the dashboard");
  }
  if (!panel.includes("response.status === 403") || !panel.includes(credentialRemoval)) {
    throw new Error("Side Panel context loading must recover from a revoked pairing");
  }
  if (!panel.includes("extensionId: body.extension_id")) {
    throw new Error("Side Panel must persist the server-issued browser identifier");
  }
  if (!worker.includes("Open the Magpie dashboard to reconnect") || !panel.includes("Open the Magpie dashboard to reconnect")) {
    throw new Error("revoked browsers must get an actionable reconnect message");
  }
});
