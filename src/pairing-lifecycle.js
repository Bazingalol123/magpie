export const PairingDisplayStatus = Object.freeze({
  AWAITING_SETUP: "awaiting_setup",
  CONNECTED_UNUSED: "connected_unused",
  ACTIVE: "active",
  REVOKED: "revoked",
});

export function derivePairingDisplayStatus(pairing) {
  if (!pairing || pairing.active === false) return PairingDisplayStatus.REVOKED;
  if (pairing.last_used_at) return PairingDisplayStatus.ACTIVE;
  if (pairing.paired_at) return PairingDisplayStatus.CONNECTED_UNUSED;
  return PairingDisplayStatus.AWAITING_SETUP;
}

export function hasActivePairing(pairings = []) {
  return pairings.some((pairing) => pairing.active !== false);
}

export function needsPairingReconnect(pairings = []) {
  return pairings.length > 0 && !hasActivePairing(pairings);
}
