/**
 * asset-edits.ts — the alt/tag edit RULES, as pure functions.
 *
 * WHY THIS IS A MODULE AND NOT THREE INLINE HANDLERS
 * The density pass (2026-08-16) moved alt-text and tag editing OUT of every
 * grid tile and into a single detail rail: the tile grid is images now, and
 * the editors are shown for the one asset the operator opened. That is a move,
 * and a move is exactly where a working feature quietly stops saving — the
 * inputs still render, the PATCH is never sent, and nothing goes red.
 *
 * So the decisions ("is this alt worth a request?", "what is the tag list
 * after adding `swimwear`?") live here, in a file a node test can run without
 * a DOM. The rail keeps only the wiring.
 */

/**
 * Should this alt draft be PATCHed?
 *
 * Trimmed, and compared against the SERVER's current value — a blur with no
 * change must not cost a request, and (the bug this pins) a blur must not
 * decide "unchanged" by comparing the draft to itself.
 */
export function altNeedsSave(
  serverAlt: string | null | undefined,
  draft: string,
): boolean {
  return draft.trim() !== (serverAlt ?? "");
}

/** The value that goes on the wire. Always the trimmed draft. */
export function altPayload(draft: string): string {
  return draft.trim();
}

/**
 * The tag list after adding `raw`, or `null` when there is nothing to save.
 *
 * Lower-cased and trimmed, because tags are matched by the library's search
 * and a "Swimwear"/"swimwear" pair is two tags an operator cannot tell apart.
 * A duplicate returns null rather than a no-op PATCH.
 */
export function tagsAfterAdd(
  tags: ReadonlyArray<string>,
  raw: string,
): string[] | null {
  const next = raw.trim().toLowerCase();
  if (!next) return null;
  if (tags.includes(next)) return null;
  return [...tags, next];
}

/**
 * The tag list after removing `tag`, or `null` when the tag was not there.
 * Removing something absent is not a save.
 */
export function tagsAfterRemove(
  tags: ReadonlyArray<string>,
  tag: string,
): string[] | null {
  if (!tags.includes(tag)) return null;
  return tags.filter((value) => value !== tag);
}
