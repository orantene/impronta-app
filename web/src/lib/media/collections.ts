/**
 * collections.ts — per-shoot "collections" (plan §8 phase 4: "collections
 * sugar on folders").
 *
 * A collection IS a folder. It has a `shoot_date` and `is_collection = true`,
 * and nothing else about it is special: the same RLS, the same actions, the
 * same membership table, the same share links. The only new behaviour is that
 * the Media page lists them under their own heading, newest shoot first,
 * because "the March editorial" is how a workspace actually talks about a
 * batch of photos and hunting for it in an alphabetical folder list is not.
 *
 * SUGAR, NOT A SYSTEM. If this file starts growing a lifecycle, statuses or
 * its own permissions, that is the signal it wanted to be a real table and
 * this shortcut was wrong.
 *
 * PURE: no `server-only`, no Supabase import, so the split and the labels are
 * unit-testable and identical on both sides of the bridge.
 */

/** The folder fields collection grouping needs. Structural on purpose. */
export type CollectionFolderLike = {
  id: string;
  name: string;
  isCollection?: boolean;
  /** ISO date (YYYY-MM-DD) or null. */
  shootDate?: string | null;
};

/**
 * A date string counts when it is a plain ISO day. Anything else is treated as
 * absent rather than rendered raw — a folder label is not the place to show a
 * parse failure.
 */
const ISO_DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

export function normalizeShootDate(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!ISO_DAY_RE.test(trimmed)) return null;
  return Number.isNaN(Date.parse(`${trimmed}T00:00:00Z`)) ? null : trimmed;
}

/**
 * Split a workspace's folders into shoots and ordinary folders.
 *
 * Collections sort newest shoot first; a collection with no date sorts after
 * every dated one (it is still a shoot, we just do not know when). Ordinary
 * folders keep whatever order the caller handed us — that is `created_at`
 * ascending from the bridge, and re-sorting it here would silently reshuffle
 * a list people have learned the shape of.
 */
export function splitFolderCollections<T extends CollectionFolderLike>(
  folders: readonly T[],
): { collections: T[]; plainFolders: T[] } {
  const collections: T[] = [];
  const plainFolders: T[] = [];

  for (const folder of folders) {
    if (folder.isCollection) collections.push(folder);
    else plainFolders.push(folder);
  }

  collections.sort((a, b) => {
    const aDate = normalizeShootDate(a.shootDate);
    const bDate = normalizeShootDate(b.shootDate);
    if (aDate && bDate) return aDate < bDate ? 1 : aDate > bDate ? -1 : a.name.localeCompare(b.name);
    if (aDate) return -1;
    if (bDate) return 1;
    return a.name.localeCompare(b.name);
  });

  return { collections, plainFolders };
}

/**
 * Sidebar label for a collection: the name, plus the shoot month and year when
 * we have one. Short because it renders in a 196px rail — the full date lives
 * in the folder editor.
 */
export function collectionNavLabel(
  folder: CollectionFolderLike,
  locale = "en",
): string {
  const date = normalizeShootDate(folder.shootDate);
  if (!date) return folder.name;
  const stamp = new Date(`${date}T00:00:00Z`).toLocaleDateString(locale, {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
  return `${folder.name} · ${stamp}`;
}
