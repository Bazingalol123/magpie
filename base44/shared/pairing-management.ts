import { HttpError } from "./http.ts";
import { getOrNull } from "./service-entities.ts";

export const PAIRING_LIST_LIMIT = 100;

export const PAIRING_PUBLIC_FIELDS = [
  "id",
  "label",
  "active",
  "created_at",
  "paired_at",
  "last_used_at",
] as const;

export type PublicPairing = {
  id: string;
  label: string;
  active: boolean;
  created_at: string | null;
  paired_at: string | null;
  last_used_at: string | null;
};

export function parseInstallationId(value: unknown) {
  if (typeof value !== "string" || !/^[A-Za-z0-9_-]{1,160}$/.test(value)) {
    throw new HttpError(400, "installation_id is required");
  }
  return value;
}

export function toPublicPairing(pairing: any): PublicPairing {
  return {
    id: String(pairing.id),
    label: typeof pairing.label === "string" && pairing.label.trim()
      ? pairing.label.trim().slice(0, 80)
      : "Chrome extension",
    active: pairing.active !== false,
    created_at: typeof pairing.created_at === "string" ? pairing.created_at : null,
    paired_at: typeof pairing.paired_at === "string" ? pairing.paired_at : null,
    last_used_at: typeof pairing.last_used_at === "string" ? pairing.last_used_at : null,
  };
}

export async function listOwnedPairings(entity: any, ownerId: string): Promise<PublicPairing[]> {
  const rows = await entity.filter(
    { owner_id: ownerId },
    "-created_at",
    PAIRING_LIST_LIMIT,
    0,
    ["owner_id", ...PAIRING_PUBLIC_FIELDS],
  );
  return rows
    .filter((row: any) => row.owner_id === ownerId)
    .map(toPublicPairing);
}

export async function revokeOwnedPairing(entity: any, ownerId: string, installationId: string) {
  const pairing = await getOrNull(entity, installationId);
  if (!pairing || pairing.owner_id !== ownerId) {
    throw new HttpError(404, "Pairing not found");
  }
  if (pairing.active !== false) {
    await entity.update(pairing.id, { active: false });
  }
  return { revoked: true };
}

export async function revokeAllOwnedPairings(entity: any, ownerId: string) {
  let skip = 0;
  let revokedCount = 0;

  // The local Base44 runtime currently returns `{ updated: 0 }` for this
  // entity's service-role updateMany call even when the owner+active filter
  // matches rows. Individual service-role updates are enforced correctly, so
  // page through the owner-scoped set and use that reliable primitive. A
  // partial failure is safe to retry because already-revoked rows are skipped.
  while (true) {
    const rows = await entity.filter(
      { owner_id: ownerId },
      "-created_at",
      PAIRING_LIST_LIMIT,
      skip,
      ["id", "owner_id", "active"],
    );
    for (const pairing of rows) {
      if (pairing.owner_id === ownerId && pairing.active !== false) {
        await entity.update(pairing.id, { active: false });
        revokedCount += 1;
      }
    }
    if (rows.length < PAIRING_LIST_LIMIT) break;
    skip += rows.length;
  }

  return { revoked_count: revokedCount };
}
