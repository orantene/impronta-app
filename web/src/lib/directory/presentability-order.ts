/**
 * Presentability ordering — PURE CORE.
 *
 * THE PROBLEM
 * The 2026-09-01 engine audit measured the live roster: 78 profiles are
 * publicly listed and exactly ONE meets the platform's own publish floor.
 * 51 have no bio, 28 have fewer than three photos. Every one of them sits in
 * the directory grid alongside the finished ones, in whatever order the
 * ranking produced, so a client's first screen can be mostly blanks. The
 * directory looks broken when the truth is that it is simply early.
 *
 * WHAT WE DECIDED NOT TO DO
 * Unlisting the 77 was rejected deliberately: an agency's roster is its
 * shopfront and hiding three quarters of it overnight is worse than showing
 * it honestly. The decision was "stay listed, rank below the ones that are
 * ready". This is that rule.
 *
 * THE RULE, in plain words — deliberately identical in shape to
 * `applyPortfolioPlacementBoost`, because a fourth different ordering idiom
 * on the same array is how ranking bugs get written:
 *
 *   1. It applies ONLY to the default "Recommended" ordering. An explicit
 *      visitor sort (featured / recent / updated / top_rated) is absolute.
 *   2. The leading FEATURED block is untouched — agency curation outranks
 *      presentability. If an agency features a bare profile, that is their
 *      call and it stays where they put it.
 *   3. Any row with a `manualRankOverride` keeps its exact slot — an explicit
 *      human order outranks everything.
 *   4. Within the remaining uncurated slots of the ALREADY-LOADED page,
 *      presentable cards move ahead of bare ones. Order inside each group is
 *      preserved exactly (stable), so whatever demand and tier decided is
 *      still what decides within a cohort.
 *   5. NOBODY IS HIDDEN. The set of rows on the page, the offset/limit window
 *      and `nextCursor` are all unchanged. It is a permutation of one page.
 *
 * WHAT COUNTS AS PRESENTABLE
 * Only what a visitor can actually see on the card: a photo and something to
 * read. Not the full publish floor — a talent can be perfectly presentable in
 * the grid while still missing a language or a home base, and those are
 * invisible at card size. Scoring the card on data the card does not show
 * would demote people for no visible reason.
 *
 *   • a thumbnail — a card with no image is a grey box
 *   • substance   — at least one trait line, fit label, or a price
 *
 * Note what is NOT here: the bio. The directory card does not render one (see
 * `DirectoryCardDTO` — name, type, location, fit labels, trait lines, price,
 * photo). Ranking on a bio would demote people for something the visitor
 * cannot see on the surface being ranked.
 *
 * A card with both leads. One of the two follows. Neither sinks. Three tiers
 * rather than a binary, so a half-finished profile still outranks an empty one
 * and a talent gets visible credit for the first thing they add.
 *
 * COMPOSITION
 * Runs AFTER demand smoothing and the Portfolio boost, so presentability is
 * the OUTER key: a paying Portfolio talent with an empty profile does not
 * outrank a finished free one. That is intentional. The tier buys placement
 * among comparable cards, not the right to be the first thing a client sees
 * when there is nothing to look at.
 */

/**
 * The minimum shape a card must have to participate in the ordering.
 * A structural subset of `DirectoryCardDTO`, so the real DTO satisfies it.
 */
export type PresentabilityCard = {
  isFeatured?: boolean | null;
  manualRankOverride?: number | null;
  thumbnail?: { url: string | null } | null;
  /** Trait lines rendered under the fit labels. */
  cardAttributes?: readonly { value: string }[] | null;
  /** Fit chips rendered on the card. */
  fitLabels?: readonly unknown[] | null;
  /** "From $X" chip. */
  priceFromCents?: number | null;
};

/** 2 = photo + substance, 1 = one of the two, 0 = neither. */
export function presentabilityTier(card: PresentabilityCard): 0 | 1 | 2 {
  const hasPhoto = Boolean(card.thumbnail?.url && card.thumbnail.url.trim());
  const hasSubstance = Boolean(
    (card.cardAttributes ?? []).some((a) => a?.value && a.value.trim()) ||
      (card.fitLabels ?? []).length > 0 ||
      (typeof card.priceFromCents === "number" && card.priceFromCents > 0),
  );
  if (hasPhoto && hasSubstance) return 2;
  if (hasPhoto || hasSubstance) return 1;
  return 0;
}

/**
 * Reorder ONE loaded page in place so presentable cards lead.
 *
 * Mutates `items` (matching the sibling smoothers, which the caller applies in
 * sequence to the same array). Returns nothing; the array IS the result.
 */
export function applyPresentabilityOrdering<T extends PresentabilityCard>(
  items: T[],
): void {
  if (items.length < 2) return;

  // The leading featured block keeps its slots. Find where it ends — featured
  // rows are contiguous at the head by the time ordering runs, so anything at
  // or after the first non-featured row is fair game.
  let firstMovable = 0;
  while (firstMovable < items.length && items[firstMovable]?.isFeatured) {
    firstMovable += 1;
  }
  if (firstMovable >= items.length - 1) return;

  // Slots occupied by a manually-arranged row are frozen: record the index so
  // the row lands back in exactly the same place.
  const frozen = new Map<number, T>();
  const movable: T[] = [];
  for (let i = firstMovable; i < items.length; i += 1) {
    const card = items[i]!;
    if (card.manualRankOverride != null) frozen.set(i, card);
    else movable.push(card);
  }
  if (movable.length < 2) return;

  // Stable partition into the three tiers. Array.prototype.sort is stable in
  // every engine we target, but an explicit bucket pass makes the stability a
  // property of this code rather than of the runtime's sort.
  const tier2: T[] = [];
  const tier1: T[] = [];
  const tier0: T[] = [];
  for (const card of movable) {
    const t = presentabilityTier(card);
    if (t === 2) tier2.push(card);
    else if (t === 1) tier1.push(card);
    else tier0.push(card);
  }
  const reordered = [...tier2, ...tier1, ...tier0];

  // Write back into the non-frozen slots, in order.
  let cursor = 0;
  for (let i = firstMovable; i < items.length; i += 1) {
    const frozenCard = frozen.get(i);
    if (frozenCard) {
      items[i] = frozenCard;
      continue;
    }
    items[i] = reordered[cursor]!;
    cursor += 1;
  }
}
