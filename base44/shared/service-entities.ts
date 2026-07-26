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

/**
 * Pages through `entity.filter(query, sort, limit, skip)` collecting every
 * owner-matching row, so a destructive cascade over a Collection's Records or
 * a Mission's Collections is complete even when there are more rows than one
 * page. Stops at a short page. `maxRows` is a defensive bound: a real cascade
 * hitting it would mean silently finishing a partial delete, so it fails loud
 * instead.
 */
export async function listAllOwned<T extends { id: string; owner_id: string }>(
  entity: any,
  query: Record<string, unknown>,
  ownerId: string,
  pageSize = 200,
  maxRows = 2000,
): Promise<T[]> {
  const rows: T[] = [];
  let skip = 0;
  for (;;) {
    const page: T[] = await entity.filter(query, "-created_date", pageSize, skip);
    for (const row of page) {
      if (row.owner_id === ownerId) rows.push(row);
    }
    if (rows.length > maxRows) {
      throw new Error(`listAllOwned exceeded ${maxRows} rows; refusing to complete a partial cascade`);
    }
    if (page.length < pageSize) break;
    skip += pageSize;
  }
  return rows;
}
