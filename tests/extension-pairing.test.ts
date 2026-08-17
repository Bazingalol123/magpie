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
