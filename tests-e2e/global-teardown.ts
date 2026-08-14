import { execFileSync } from "node:child_process";
import fs from "node:fs";
import { AUTH_DIR, RUNTIME_FILE, readRuntime } from "./helpers/config";

function killProcessTree(pid: number, label: string): void {
  try {
    if (process.platform === "win32") {
      // /t kills the whole tree: base44 dev is spawned with shell: true, so
      // pid is cmd.exe's pid with `npx`/the CLI's own child processes
      // (including the frontend `npm run dev` -> vite process it starts)
      // nested underneath it.
      execFileSync("taskkill", ["/pid", String(pid), "/t", "/f"], { stdio: "ignore" });
    } else {
      // Best-effort single-process kill. A true tree-kill on POSIX needs the
      // child spawned with `detached: true` (its own process group) so a
      // negative pid can target the whole group; global-setup.ts does not
      // set that, since this harness's only exercised platform is Windows
      // (CLAUDE.md's release-gate commands are all PowerShell). Flagging
      // this rather than silently pretending POSIX is fully handled.
      process.kill(pid, "SIGTERM");
    }
    console.log(`[global-teardown] Stopped ${label} (pid=${pid})`);
  } catch (error) {
    console.warn(`[global-teardown] Could not stop ${label} (pid=${pid}), it may already be gone: ${String(error)}`);
  }
}

export default async function globalTeardown(): Promise<void> {
  if (!fs.existsSync(RUNTIME_FILE)) {
    console.warn("[global-teardown] No runtime.json found; nothing spawned by global setup to stop.");
    return;
  }

  const runtime = readRuntime();
  killProcessTree(runtime.pids.fixturesServer, "fixtures-server");
  killProcessTree(runtime.pids.base44Dev, "base44 dev (backend + frontend)");

  // Credentials, the runtime port/PID map, and the paired Chrome profile are
  // all disposable — a fresh global-setup run regenerates all three, and
  // the local base44 dev database they point at is in-memory and already
  // gone with the process. Removing them avoids a stale profile lock or a
  // stale port number leaking into the next run.
  fs.rmSync(AUTH_DIR, { recursive: true, force: true });
  console.log("[global-teardown] Done.");
}
