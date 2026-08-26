/**
 * Portfolio (Max) priority placement in Discover — PURE CORE.
 *
 * The 2026 catalog markets "priority / top Discover placement" for the talent
 * Portfolio (Max) tier. Nothing implemented it. This is that implementation,
 * deliberately built as a TIE-BREAK inside the existing ordering rather than a
 * new sort dimension, mirroring `applyDemandSmoothing` / `applyTopRatedSmoothing`.
 *
 * THE RULE, in plain words:
 *
 *   1. It applies ONLY to the default "Recommended" ordering. If the visitor
 *      picked an explicit sort (featured / recent / updated / top_rated), their
 *      choice is absolute and this does nothing.
 *   2. The leading FEATURED block is untouched — agency curation outranks tier.
 *   3. Any row with a `manualRankOverride` (roster "Arrange directory order")
 *      keeps its exact slot — an explicit human order outranks tier.
 *   4. Within the remaining uncurated slots of the ALREADY-LOADED page,
 *      Portfolio-tier talents move ahead of non-Portfolio ones. Relative order
 *      inside each group is preserved exactly (stable).
 *   5. Nobody is hidden, dropped, or demoted below where the non-Portfolio
 *      cohort already sat: the set of rows on the page, the offset/limit window
 *      and `nextCursor` are all unchanged. It is a permutation of one page.
 *
 * Because it is a permutation of a loaded page, it composes with the demand
 * smoothing that runs on the same slots: demand orders the cohort, then the
 * Portfolio boost lifts the paying tier within that order (applied after, so
 * tier is the OUTER key and demand the inner tie-break).
 */

/** The minimum shape a card must have to participate in the boost. */
export interface PortfolioBoostCard {
  id: string;
  isFeatured: boolean;
  manualRankOverride?: number | null;
}

/**
 * Stable, in-place Portfolio-first re-rank of the loaded page. `portfolioIds`
 * is the set of `talent_profiles.id` on this page whose `talent_plan_key` is
 * `talent_portfolio`. An empty set is a no-op.
 */
export function applyPortfolioPlacementBoost<T extends PortfolioBoostCard>(
  items: T[],
  portfolioIds: ReadonlySet<string>,
): void {
  if (items.length < 2 || portfolioIds.size === 0) return;

  // Rule 2 — skip the leading featured block.
  let firstNonFeatured = 0;
  while (firstNonFeatured < items.length && items[firstNonFeatured].isFeatured) {
    firstNonFeatured++;
  }

  // Rule 3 — only uncurated slots are eligible.
  const slots: number[] = [];
  for (let i = firstNonFeatured; i < items.length; i++) {
    if (items[i].manualRankOverride == null) slots.push(i);
  }
  if (slots.length < 2) return;

  // Rule 4 — stable partition: Portfolio first, everyone else after, each
  // group keeping the order it already had.
  const reordered = slots
    .map((slot, i) => ({
      item: items[slot],
      i,
      tier: portfolioIds.has(items[slot].id) ? 1 : 0,
    }))
    .sort((a, b) => b.tier - a.tier || a.i - b.i)
    .map((entry) => entry.item);

  for (let i = 0; i < slots.length; i++) items[slots[i]] = reordered[i];
}
