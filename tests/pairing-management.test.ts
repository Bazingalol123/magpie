import { assertEquals, assertRejects } from "jsr:@std/assert";
import { HttpError } from "../base44/shared/http.ts";
import {
  listOwnedPairings,
  parseInstallationId,
  revokeAllOwnedPairings,
  revokeOwnedPairing,
} from "../base44/shared/pairing-management.ts";

function pairing(overrides: Record<string, unknown> = {}) {
  return {
    id: "install-1",
    owner_id: "owner-1",
    label: "Work browser",
    token_hash: "must-never-leave-the-backend",
    active: true,
    created_at: "2026-08-20T10:00:00.000Z",
    paired_at: null,
    last_used_at: null,
    ...overrides,
  };
}

Deno.test("pairing list is owner-scoped, bounded, and excludes token material", async () => {
  let call: unknown[] = [];
  const entity = {
    filter: async (...args: unknown[]) => {
      call = args;
      return [pairing(), pairing({ id: "foreign", owner_id: "owner-2" })];
    },
  };

  const result = await listOwnedPairings(entity, "owner-1");

  assertEquals(result, [{
    id: "install-1",
    label: "Work browser",
    active: true,
    created_at: "2026-08-20T10:00:00.000Z",
    paired_at: null,
    last_used_at: null,
  }]);
  assertEquals(call[0], { owner_id: "owner-1" });
  assertEquals(call[2], 100);
  assertEquals((call[4] as string[]).includes("owner_id"), true);
  assertEquals((call[4] as string[]).includes("token_hash"), false);
});

Deno.test("revoke one is idempotent and only mutates an owned active pairing", async () => {
  const updates: unknown[] = [];
  const entity = {
    get: async () => pairing(),
    update: async (...args: unknown[]) => updates.push(args),
  };

  assertEquals(await revokeOwnedPairing(entity, "owner-1", "install-1"), { revoked: true });
  assertEquals(updates, [["install-1", { active: false }]]);

  entity.get = async () => pairing({ active: false });
  assertEquals(await revokeOwnedPairing(entity, "owner-1", "install-1"), { revoked: true });
  assertEquals(updates.length, 1);
});

Deno.test("missing and foreign pairing ids both return the same 404", async () => {
  const missing = { get: async () => { throw new Error("Entity ExtensionInstall with ID missing not found"); } };
  const foreign = { get: async () => pairing({ owner_id: "owner-2" }) };

  for (const entity of [missing, foreign]) {
    const error = await assertRejects(() => revokeOwnedPairing(entity, "owner-1", "install-1"), HttpError);
    assertEquals(error.status, 404);
    assertEquals(error.message, "Pairing not found");
  }
});

Deno.test("revoke all pages owner rows and uses the runtime-reliable single update primitive", async () => {
  const filterCalls: unknown[][] = [];
  const updateCalls: unknown[][] = [];
  const entity = {
    filter: async (...args: unknown[]) => {
      filterCalls.push(args);
      return [
        pairing({ id: "active-1" }),
        pairing({ id: "already-revoked", active: false }),
        pairing({ id: "foreign", owner_id: "owner-2" }),
      ];
    },
    update: async (...args: unknown[]) => updateCalls.push(args),
  };

  assertEquals(await revokeAllOwnedPairings(entity, "owner-1"), { revoked_count: 1 });
  assertEquals(filterCalls[0]?.[0], { owner_id: "owner-1" });
  assertEquals(filterCalls[0]?.[2], 100);
  assertEquals(updateCalls, [["active-1", { active: false }]]);
});

Deno.test("pairing ids are bounded before any entity lookup", () => {
  assertEquals(parseInstallationId("install_123-abc"), "install_123-abc");
  for (const value of [null, "", "bad/id", "x".repeat(161)]) {
    let error: unknown;
    try {
      parseInstallationId(value);
    } catch (caught) {
      error = caught;
    }
    if (!(error instanceof HttpError) || error.status !== 400) {
      throw new Error(`expected a 400 HttpError for ${String(value)}`);
    }
  }
});
