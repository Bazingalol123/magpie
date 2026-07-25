// The hosted SDK throws (`Base44Error: Entity <name> with ID <id> not found`)
// on get()/delete() for a missing ID rather than returning null, so any
// `if (!row)` guard after a bare get() is dead code in production and the
// error escapes as a 500 (docs/ENGINEERING_NOTES.md, 2026-07-25). These
// helpers map that platform behavior back to the documented contracts.

export async function getOrNull(entity: any, id: string) {
  try {
    return await entity.get(id);
  } catch (error) {
    if (isNotFoundError(error)) return null;
    throw error;
  }
}

export async function deleteIfPresent(entity: any, id: string) {
  try {
    await entity.delete(id);
    return true;
  } catch (error) {
    if (isNotFoundError(error)) return false;
    throw error;
  }
}

export function isNotFoundError(error: unknown) {
  const status = (error as { status?: unknown; response?: { status?: unknown } })?.status ??
    (error as { response?: { status?: unknown } })?.response?.status;
  if (status === 404) return true;
  return error instanceof Error && /\bnot found\b/i.test(error.message);
}
