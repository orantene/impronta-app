/**
 * The photo an owner puts on a hub entry (TUL-1369). Pure. The owner picks from the
 * photos of the services already inside that entry, never from an arbitrary media id,
 * so an entry can only ever show a photo that belongs to one of its own members.
 */

export type PhotoChoice = { mediaId: string; url: string };

export const MAX_PHOTO_CHOICES = 24;

/** The entry's choices: its offerings' photos in order, deduped by media id, capped. */
export function choicesForEntry(offeringIds: readonly string[], byOffering: ReadonlyMap<string, readonly PhotoChoice[]>): PhotoChoice[] {
  const seen = new Set<string>();
  const out: PhotoChoice[] = [];
  for (const id of offeringIds) {
    for (const c of byOffering.get(id) ?? []) {
      if (seen.has(c.mediaId)) continue;
      seen.add(c.mediaId);
      out.push(c);
      if (out.length >= MAX_PHOTO_CHOICES) return out;
    }
  }
  return out;
}

/** Clearing (null) is always fine; a photo must be one of the entry's own choices. */
export function photoChoiceAllowed(choices: readonly PhotoChoice[], mediaId: string | null): boolean {
  return mediaId === null || choices.some((c) => c.mediaId === mediaId);
}
