import { assertEquals } from "jsr:@std/assert";
import {
  PairingDisplayStatus,
  derivePairingDisplayStatus,
  hasActivePairing,
  needsPairingReconnect,
} from "../src/pairing-lifecycle.js";

Deno.test("pairing status distinguishes legacy use, handshake, setup, and revoke", () => {
  assertEquals(derivePairingDisplayStatus({ active: true }), PairingDisplayStatus.AWAITING_SETUP);
  assertEquals(
    derivePairingDisplayStatus({ active: true, paired_at: "2026-08-24T10:00:00Z" }),
    PairingDisplayStatus.CONNECTED_UNUSED,
  );
  assertEquals(
    derivePairingDisplayStatus({ active: true, last_used_at: "2026-08-24T10:00:00Z" }),
    PairingDisplayStatus.ACTIVE,
  );
  assertEquals(
    derivePairingDisplayStatus({ active: false, last_used_at: "2026-08-24T10:00:00Z" }),
    PairingDisplayStatus.REVOKED,
  );
});

Deno.test("reconnect appears only for real pairing history with no active browser", () => {
  assertEquals(hasActivePairing([{ active: false }, { active: true }]), true);
  assertEquals(needsPairingReconnect([]), false);
  assertEquals(needsPairingReconnect([{ active: false }]), true);
  assertEquals(needsPairingReconnect([{ active: false }, { active: true }]), false);
});

Deno.test("dashboard wiring uses the sanitized pairing function and exposes management", async () => {
  const app = await Deno.readTextFile(new URL("../src/App.jsx", import.meta.url));
  const pairingManagementDialog = await Deno.readTextFile(new URL("../src/features/pairing/PairingManagementDialog.jsx", import.meta.url));
  if (!app.includes('base44.functions.invoke("list-extension-pairings"')) {
    throw new Error("dashboard must load pairing metadata through the sanitized owner function");
  }
  if (!pairingManagementDialog.includes("function PairingManagementDialog")) {
    throw new Error("dashboard must expose Connected browsers management");
  }
  if (!app.includes('base44.functions.invoke("revoke-extension-pairing"')) {
    throw new Error("dashboard must wire per-browser revoke");
  }
  if (!app.includes('base44.functions.invoke("revoke-all-extension-pairings"')) {
    throw new Error("dashboard must wire the emergency revoke-all action");
  }
});
