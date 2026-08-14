import { readOwner, readRuntime, sleep } from "./config";

export type ClipRow = Record<string, any>;

/**
 * Plain-fetch client against the local base44 dev entities REST API
 * (GET /api/apps/:appId/entities/:entityName[?q=<json filter>&sort=&limit=]
 * and GET /api/apps/:appId/entities/:entityName/:id), authenticated with the
 * test owner's real access_token from the /verify-otp response
 * (tests-e2e/global-setup.ts). This is the exact contract
 * base44.entities.<Entity>.filter()/get() calls over in the real SDK
 * (confirmed by reading node_modules/base44/dist/cli/index.js's dev-server
 * entity routes, not guessed) — reusing that shape here (`.filter(query,
 * sort, limit)` / `.get(id)`) keeps every spec below unchanged either way.
 *
 * This deliberately does NOT use @base44/sdk from Node: doing so crashes
 * every spec at collection time under Playwright's test-worker runtime
 * specifically (`TypeError: debug_1.default is not a function`, inside
 * axios's https-proxy-agent -> agent-base -> debug chain) — reproduced with
 * a one-line `import { createClient } from "@base44/sdk"` in a spec file,
 * while the identical import works fine under plain Node (used successfully
 * elsewhere in this harness, e.g. global-setup.ts's registration flow, and
 * by the dashboard's own browser bundle). See docs/ENGINEERING_NOTES.md for
 * the full investigation — this is a Playwright-worker/dependency
 * incompatibility, not a bug in this repo's code, and the direct-fetch
 * approach here sidesteps it entirely while still exercising the same
 * authenticated, owner-scoped entities API the issue asks tests to poll.
 */
function makeClipEntityClient(accessToken: string) {
  async function request(path: string): Promise<any> {
    const runtime = readRuntime();
    const url = `${runtime.backendBaseUrl}/api/apps/${runtime.appId}/entities/${path}`;
    const response = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(`GET ${url} failed (${response.status}): ${body}`);
    }
    return response.json();
  }

  return {
    async filter(query: Record<string, unknown>, sort?: string, limit?: number): Promise<ClipRow[]> {
      const params = new URLSearchParams();
      params.set("q", JSON.stringify(query));
      if (sort) params.set("sort", sort);
      if (limit) params.set("limit", String(limit));
      return request(`Clip?${params.toString()}`);
    },
    async get(id: string): Promise<ClipRow> {
      return request(`Clip/${encodeURIComponent(id)}`);
    },
  };
}

export async function createOwnerClient(ownerKey = "ownerA") {
  const owner = readOwner(ownerKey);
  const client = { entities: { Clip: makeClipEntityClient(owner.accessToken) } };
  return { client, owner };
}

type ClipEntityClient = ReturnType<typeof makeClipEntityClient>;
type OwnerClient = { entities: { Clip: ClipEntityClient } };

/**
 * Polls for a Clip created by this test run rather than assuming the most
 * recent row is the one just captured — every spec in this suite shares one
 * owner and one long-lived local database across the whole serial run
 * (workers: 1, extension paired once in global setup), so an earlier spec's
 * leftover Clip of the same capture_mode is a real possible false match.
 * `notBeforeIso` (captured immediately before triggering the capture under
 * test) plus an optional `sourceUrlIncludes` narrows to the right row.
 */
export async function waitForNewClip(
  client: OwnerClient,
  options: {
    ownerId: string;
    captureMode: string;
    notBeforeIso: string;
    sourceUrlIncludes?: string;
    timeoutMs?: number;
    intervalMs?: number;
  },
): Promise<ClipRow> {
  const { ownerId, captureMode, notBeforeIso, sourceUrlIncludes, timeoutMs = 25_000, intervalMs = 500 } = options;
  const deadline = Date.now() + timeoutMs;
  let lastSeenCount = -1;
  while (Date.now() < deadline) {
    const rows = await client.entities.Clip.filter({ owner_id: ownerId, capture_mode: captureMode }, "-created_date", 10);
    lastSeenCount = rows.length;
    const match = rows.find(
      (row) =>
        typeof row.created_date === "string" &&
        row.created_date >= notBeforeIso &&
        (!sourceUrlIncludes || (typeof row.source_url === "string" && row.source_url.includes(sourceUrlIncludes))),
    );
    if (match) return match;
    await sleep(intervalMs);
  }
  throw new Error(
    `Timed out waiting for a new "${captureMode}" Clip created at/after ${notBeforeIso}` +
      (sourceUrlIncludes ? ` with source_url containing "${sourceUrlIncludes}"` : "") +
      ` (owner_id=${ownerId}). Most recent poll saw ${lastSeenCount} row(s) of this capture_mode.`,
  );
}

/** Confirms a retried/duplicate capture did not create a second Clip row —
 * the actual regression B8's dedupe fix guards against (docs/BUGS_AND_BEHAVIORS.md). */
export async function countClipsForSource(
  client: OwnerClient,
  options: { ownerId: string; captureMode: string; sourceUrl: string },
): Promise<number> {
  const rows = await client.entities.Clip.filter(
    { owner_id: options.ownerId, capture_mode: options.captureMode, source_url: options.sourceUrl },
    "-created_date",
    50,
  );
  return rows.length;
}

export async function getClip(client: OwnerClient, clipId: string): Promise<ClipRow> {
  return client.entities.Clip.get(clipId);
}
