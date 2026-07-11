/**
 * prune-duplicate-system-notes — W1-2 pure core for the one-shot cleanup of
 * historical system-note spam.
 *
 * WHY: W1-1 clusters the RENDER of system notes, but the DB still holds the
 * historical duplicates (the owner's screenshot: six identical "Added 9 talent
 * to your inquiry." rows). Those still surface in Inquiries-list previews and
 * emails. This module decides, purely, WHICH rows to delete: within a run of
 * consecutive same-body system rows, keep the NEWEST and delete the rest. It
 * never touches human messages, cards, or non-adjacent notes.
 *
 * The script (scripts/prune-duplicate-system-notes.mts) applies these ids in a
 * dry-run-first, service-role sweep; this function is unit-tested in isolation.
 */

export type PrunableRow = {
  id: string;
  /** message author role — only "system" rows are eligible. */
  authorRole: string;
  /** normalized note text — identical bodies in a run collapse to one. */
  body: string;
  /** creation timestamp (ISO or epoch) — the newest of a run is kept. */
  createdAt: string;
};

/**
 * Given an inquiry's private-thread rows in chronological order, return the ids
 * of the duplicate system rows to DELETE. A "duplicate run" = ≥2 consecutive
 * system rows with the same body; all but the last (newest) are returned.
 *
 * Adjacency is required: identical notes separated by a human message or a
 * different note are NOT duplicates (they mark distinct moments). This mirrors
 * the render clustering so pruning can only ever remove noise the UI already
 * folds away.
 */
export function findPrunableSystemRowIds(rows: PrunableRow[]): string[] {
  const toDelete: string[] = [];
  let i = 0;
  while (i < rows.length) {
    const row = rows[i]!;
    if (row.authorRole !== "system") {
      i += 1;
      continue;
    }
    // Extend a run of consecutive system rows with the SAME body.
    let j = i + 1;
    while (
      j < rows.length &&
      rows[j]!.authorRole === "system" &&
      rows[j]!.body === row.body
    ) {
      j += 1;
    }
    const runLen = j - i;
    if (runLen >= 2) {
      // Keep the newest (last in chronological order); delete the earlier ones.
      for (let k = i; k < j - 1; k += 1) {
        toDelete.push(rows[k]!.id);
      }
    }
    i = j;
  }
  return toDelete;
}
