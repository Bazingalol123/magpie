import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const REPO_ROOT = path.resolve(__dirname, "../..");
export const EXTENSION_DIR = path.join(REPO_ROOT, "extension");
export const FIXTURES_DIR = path.resolve(__dirname, "../fixtures");
export const AUTH_DIR = path.resolve(__dirname, "../.auth");
export const PROFILE_DIR = path.join(AUTH_DIR, "chrome-profile");
export const RUNTIME_FILE = path.join(AUTH_DIR, "runtime.json");
export const OWNER_FILE = path.join(AUTH_DIR, "owner.json");
export const FIXTURES_SERVER_SCRIPT = path.join(__dirname, "fixtures-server.mjs");

// Pinned ports (CLAUDE.md's local-verification harness / issue #19 Phase 1
// decision: an explicit port, not "next free port", so the harness is
// reproducible and global-teardown always knows what it started). The
// frontend port is not pinned here because `npx base44 dev` runs
// `site.serveCommand` (`npm run dev` -> vite) verbatim with no port flag of
// its own; global-setup.ts parses the actual port vite picked out of its
// stdout instead. See docs/DECISIONS.md.
export const BASE44_PORT = 4491;
export const FIXTURES_PORT = 8991;
export const BASE44_BASE_URL = `http://localhost:${BASE44_PORT}`;
export const FIXTURES_BASE_URL = `http://localhost:${FIXTURES_PORT}`;

export type TestOwner = {
  key: string;
  email: string;
  password: string;
  id: string;
  accessToken: string;
};

export type Runtime = {
  appId: string;
  backendBaseUrl: string;
  backendPort: number;
  frontendBaseUrl: string;
  frontendPort: number;
  fixturesBaseUrl: string;
  pids: { base44Dev: number; fixturesServer: number };
};

/** Reads the app id out of the gitignored, worktree-local base44/.app.jsonc
 * link file. Every checkout of this repo (including a fresh `git worktree
 * add`) needs its own copy — it is intentionally not committed
 * (base44-cli skill), so a fresh clone must run `npx base44 link` or copy
 * the file from an already-linked checkout before this harness can run. */
export function readAppId(): string {
  const appJsoncPath = path.join(REPO_ROOT, "base44", ".app.jsonc");
  if (!fs.existsSync(appJsoncPath)) {
    throw new Error(
      `Missing ${appJsoncPath}. This checkout is not linked to the Base44 app yet. ` +
        `Run "npx base44 whoami" to confirm you are logged in, then either run ` +
        `"npx base44 link" or copy base44/.app.jsonc from another linked checkout of ` +
        `this repo (it is gitignored and worktree-local, not committed).`,
    );
  }
  const raw = fs.readFileSync(appJsoncPath, "utf8");
  const match = raw.match(/"id"\s*:\s*"([^"]+)"/);
  if (!match) throw new Error(`Could not read an "id" field out of ${appJsoncPath}`);
  return match[1];
}

export function readRuntime(): Runtime {
  if (!fs.existsSync(RUNTIME_FILE)) {
    throw new Error(`${RUNTIME_FILE} is missing. Did global setup run (tests-e2e/global-setup.ts)?`);
  }
  return JSON.parse(fs.readFileSync(RUNTIME_FILE, "utf8"));
}

export function writeRuntime(runtime: Runtime): void {
  fs.mkdirSync(AUTH_DIR, { recursive: true });
  fs.writeFileSync(RUNTIME_FILE, JSON.stringify(runtime, null, 2));
}

export function readOwner(key = "ownerA"): TestOwner {
  if (!fs.existsSync(OWNER_FILE)) {
    throw new Error(`${OWNER_FILE} is missing. Did global setup run (tests-e2e/global-setup.ts)?`);
  }
  const owners = JSON.parse(fs.readFileSync(OWNER_FILE, "utf8")) as Record<string, TestOwner>;
  const owner = owners[key];
  if (!owner) throw new Error(`No test owner registered under key "${key}" in ${OWNER_FILE}`);
  return owner;
}

export function writeOwners(owners: Record<string, TestOwner>): void {
  fs.mkdirSync(AUTH_DIR, { recursive: true });
  fs.writeFileSync(OWNER_FILE, JSON.stringify(owners, null, 2));
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
