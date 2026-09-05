/**
 * verb-destination.ts — the pure half: which block answers which verb.
 *
 * Free of `server-only` on purpose, so the test lane can import it directly.
 * `verb-destination.server.ts` does the I/O and imports from here. Same split
 * as `links/code.ts` and `links/link-store.ts`, and for the same reason: a
 * `server-only` import breaks both the test lane and any client component.
 */

/**
 * Which builder block makes a page able to answer a given verb.
 *
 * ONLY `reserve` IS LISTED, and that is a statement about the codebase rather
 * than an omission. `reserve_table` is the only booking block that exists in
 * `builder-node/types.ts` today; there is no appointments block, so `book` has
 * nothing to look for and correctly keeps the chat cue. When one ships, adding
 * its kind here is the whole change.
 */
export const VERB_BLOCK_KINDS: Readonly<Record<string, readonly string[]>> = {
  reserve: ["reserve_table"],
};

/** Does this page carry one of these blocks anywhere in its tree? */
export function pageCarriesBlock(blocks: unknown, kinds: readonly string[]): boolean {
  if (!blocks) return false;
  let json: string;
  try {
    json = JSON.stringify(blocks);
  } catch {
    // A blob that will not serialise cannot be searched. Treat it as "no", so a
    // malformed page can never make the header point somewhere unproven.
    return false;
  }
  // Matched on the serialised `kind` field rather than the bare name, so a page
  // whose prose happens to contain the word does not masquerade as a booking
  // page. JSON.stringify emits no whitespace, so the compact form is exact.
  return kinds.some((kind) => json.includes(`"kind":"${kind}"`));
}
