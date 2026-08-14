import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import fs from "node:fs";

import {
  AUTH_DIR,
  BASE44_BASE_URL,
  BASE44_PORT,
  FIXTURES_BASE_URL,
  FIXTURES_DIR,
  FIXTURES_PORT,
  FIXTURES_SERVER_SCRIPT,
  PROFILE_DIR,
  REPO_ROOT,
  readAppId,
  sleep,
  writeOwners,
  writeRuntime,
  type TestOwner,
} from "./helpers/config";
import { getExtensionId, launchExtensionContext } from "./helpers/browser";
import { loginDashboard, pairExtensionViaDialog } from "./helpers/dashboard";
import { openPopup, savePairingIntoExtension } from "./helpers/capture";

// Phase 1 (issue #19) needs exactly one owner to drive the 6-mode capture
// matrix end to end; a second owner / cross-owner isolation fixture is
// already covered locally by G4 (docs/BUGS_AND_BEHAVIORS.md) and is out of
// scope here — see docs/DECISIONS.md.
const TEST_OWNERS: Array<{ key: string; email: string; password: string }> = [
  { key: "ownerA", email: "magpie-e2e-owner-a@example.test", password: "MagpieE2EOwner!1" },
];

const OTP_PATTERN = /verification code:\s*(\d{6})/gi;

function stripAnsi(value: string): string {
  // eslint-disable-next-line no-control-regex
  return value.replace(/\x1b\[[0-9;]*m/g, "");
}

async function waitForHttp(url: string, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let lastError: unknown;
  while (Date.now() < deadline) {
    try {
      await fetch(url);
      return;
    } catch (error) {
      lastError = error;
      await sleep(300);
    }
  }
  throw new Error(`Timed out waiting for ${url} to respond: ${String(lastError)}`);
}

function waitForLogPattern(getBuffer: () => string, pattern: RegExp, timeoutMs: number): Promise<RegExpMatchArray> {
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + timeoutMs;
    const check = () => {
      const match = getBuffer().match(pattern);
      if (match) {
        resolve(match);
        return;
      }
      if (Date.now() > deadline) {
        reject(new Error(`Timed out waiting for /${pattern.source}/ in base44 dev output.\n--- captured output ---\n${getBuffer()}`));
        return;
      }
      setTimeout(check, 300);
    };
    check();
  });
}

function countOtpMatches(buffer: string): number {
  return [...buffer.matchAll(OTP_PATTERN)].length;
}

async function waitForNextOtp(getBuffer: () => string, previousCount: number, timeoutMs = 15_000): Promise<string> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const matches = [...getBuffer().matchAll(OTP_PATTERN)];
    if (matches.length > previousCount) {
      return matches[matches.length - 1][1];
    }
    await sleep(200);
  }
  throw new Error("Timed out waiting for a new OTP to appear in base44 dev's stdout");
}

async function registerAndVerifyOwner(
  appId: string,
  getLogBuffer: () => string,
  owner: { key: string; email: string; password: string },
): Promise<TestOwner> {
  const otpCountBefore = countOtpMatches(getLogBuffer());

  const registerResponse = await fetch(`${BASE44_BASE_URL}/api/apps/${appId}/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: owner.email, password: owner.password }),
  });
  if (!registerResponse.ok) {
    const body = await registerResponse.text().catch(() => "");
    throw new Error(`Registering ${owner.email} failed (${registerResponse.status}): ${body}`);
  }

  // The local base44 dev server prints the OTP to its own stdout instead of
  // sending real email (docs/ENGINEERING_NOTES.md, 2026-08-14 "G4" entry —
  // confirmed by reading the installed CLI source, not guessed).
  const otp = await waitForNextOtp(getLogBuffer, otpCountBefore);

  const verifyResponse = await fetch(`${BASE44_BASE_URL}/api/apps/${appId}/auth/verify-otp`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: owner.email, otp_code: otp }),
  });
  if (!verifyResponse.ok) {
    const body = await verifyResponse.text().catch(() => "");
    throw new Error(`Verifying OTP for ${owner.email} failed (${verifyResponse.status}): ${body}`);
  }
  const verified = (await verifyResponse.json()) as { id: string; access_token: string };
  if (!verified.id || !verified.access_token) {
    throw new Error(`verify-otp response for ${owner.email} was missing id/access_token: ${JSON.stringify(verified)}`);
  }

  return { key: owner.key, email: owner.email, password: owner.password, id: verified.id, accessToken: verified.access_token };
}

export default async function globalSetup(): Promise<void> {
  fs.rmSync(AUTH_DIR, { recursive: true, force: true });
  fs.mkdirSync(AUTH_DIR, { recursive: true });

  const appId = readAppId();

  console.log(`[global-setup] Starting "npx base44 dev --port ${BASE44_PORT}" from ${REPO_ROOT} ...`);
  const isWindows = process.platform === "win32";
  const base44Dev = spawn(`npx${isWindows ? ".cmd" : ""} base44 dev --port ${BASE44_PORT}`, {
    cwd: REPO_ROOT,
    shell: true,
  }) as ChildProcessWithoutNullStreams;

  let base44DevBuffer = "";
  base44Dev.stdout.on("data", (chunk) => {
    const text = stripAnsi(String(chunk));
    base44DevBuffer += text;
    process.stdout.write(`[base44 dev] ${text}`);
  });
  base44Dev.stderr.on("data", (chunk) => {
    const text = stripAnsi(String(chunk));
    base44DevBuffer += text;
    process.stderr.write(`[base44 dev] ${text}`);
  });
  base44Dev.on("exit", (code, signal) => {
    if (code !== null && code !== 0) {
      console.error(`[global-setup] base44 dev exited early (code=${code}, signal=${signal})`);
    }
  });
  if (!base44Dev.pid) {
    throw new Error("Failed to spawn `npx base44 dev` (no PID) — is the base44 CLI installed (npm install)?");
  }

  const backendMatch = await waitForLogPattern(() => base44DevBuffer, /Backend running on http:\/\/localhost:(\d+)/, 90_000);
  const backendPort = Number(backendMatch[1]);
  if (backendPort !== BASE44_PORT) {
    throw new Error(`base44 dev reported backend port ${backendPort}, expected the pinned port ${BASE44_PORT}`);
  }

  const frontendMatch = await waitForLogPattern(() => base44DevBuffer, /Local:\s*\S*http:\/\/localhost:(\d+)/, 90_000);
  const frontendPort = Number(frontendMatch[1]);
  const frontendBaseUrl = `http://localhost:${frontendPort}`;
  console.log(`[global-setup] base44 dev is up: backend=${BASE44_BASE_URL} frontend=${frontendBaseUrl}`);

  console.log(`[global-setup] Starting fixtures server on port ${FIXTURES_PORT} ...`);
  const fixturesServer = spawn(process.execPath, [FIXTURES_SERVER_SCRIPT, String(FIXTURES_PORT), FIXTURES_DIR], {
    cwd: REPO_ROOT,
  });
  fixturesServer.stdout.on("data", (chunk) => process.stdout.write(`[fixtures-server] ${chunk}`));
  fixturesServer.stderr.on("data", (chunk) => process.stderr.write(`[fixtures-server] ${chunk}`));
  if (!fixturesServer.pid) {
    throw new Error("Failed to spawn the fixtures static server (no PID)");
  }
  await waitForHttp(`${FIXTURES_BASE_URL}/index.html`, 15_000);

  console.log("[global-setup] Registering the test owner via the local /auth/register + /verify-otp flow ...");
  const owners: Record<string, TestOwner> = {};
  for (const owner of TEST_OWNERS) {
    owners[owner.key] = await registerAndVerifyOwner(appId, () => base44DevBuffer, owner);
    console.log(`[global-setup] Registered and verified ${owner.email} (id=${owners[owner.key].id})`);
  }
  writeOwners(owners);

  writeRuntime({
    appId,
    backendBaseUrl: BASE44_BASE_URL,
    backendPort,
    frontendBaseUrl,
    frontendPort,
    fixturesBaseUrl: FIXTURES_BASE_URL,
    pids: { base44Dev: base44Dev.pid, fixturesServer: fixturesServer.pid },
  });

  console.log("[global-setup] Pairing the extension once for the whole run, through the real dashboard UI ...");
  fs.rmSync(PROFILE_DIR, { recursive: true, force: true });
  const context = await launchExtensionContext();
  try {
    const extensionId = await getExtensionId(context);
    const dashboardPage = await context.newPage();
    await loginDashboard(dashboardPage, frontendBaseUrl, owners.ownerA);
    const pairing = await pairExtensionViaDialog(dashboardPage);
    console.log(`[global-setup] Pairing dialog returned ingest_url=${pairing.ingestUrl}`);

    const popup = await openPopup(context, extensionId);
    await savePairingIntoExtension(popup, pairing);
    await popup.close();
    await dashboardPage.close();
    console.log("[global-setup] Extension paired and connection confirmed (popup body[data-connected=true]).");
  } finally {
    await context.close();
  }

  console.log("[global-setup] Done.");
}
