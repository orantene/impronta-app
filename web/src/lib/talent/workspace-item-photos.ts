/**
 * TUL-1271 #1 — pure rules for a workspace catalog item's photo list.
 * The first photo is the cover. No schema: `talent_offering_media` joins an
 * offering to a tenant-owned `media_assets` row.
 */
export const MAX_ITEM_PHOTOS = 12;

export function nextPhotoIds(current: readonly string[], change: { add?: readonly string[]; remove?: string }): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const id of [...current, ...(change.add ?? [])]) {
    if (id === change.remove || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out.slice(0, MAX_ITEM_PHOTOS);
}
