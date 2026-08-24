import { buildIngestUrl } from "../base44/shared/auth.ts";

function assertEquals(actual: unknown, expected: unknown, message: string) {
  const left = JSON.stringify(actual);
  const right = JSON.stringify(expected);
  if (left !== right) throw new Error(`${message}\nexpected: ${right}\nactual:   ${left}`);
}

Deno.test("new pairings receive the custom-domain ingest URL (issue #59)", () => {
  assertEquals(
    buildIngestUrl(),
    "https://magpiecapture.com/functions/ingest-clip",
    "create-extension-pairing must return the public custom-domain ingest URL for new pairings",
  );
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
  if (entry.includes("last_used_at")) throw new Error("extension-context must not reinterpret last_used_at as a pairing handshake");
});
