/**
 * manual-filter.ts — pure, framework-free helpers for the `scope=manual`
 * render-level filter (P4).
 *
 * The directory engine listing accepts `profileCodes` for SSR, so a
 * `scope=manual` first page is already the picked set. The reactive grid still
 * trims + re-orders client-side (pick order, and any later `/api/directory`
 * refetch that does not yet send profile codes). These helpers are the pure
 * core of that trim so it can be unit-tested without rendering React:
 *
 *   - `buildManualCodeOrder` → an index map (code → pick position), de-duped,
 *     or `null` when no codes are picked (manual filter inactive).
 *   - `filterToManualCodes`  → keep only picked codes, de-duped, sorted into
 *     the operator's pick order.
 *
 * Render-level trim: keep the visible grid in pick order even if a client
 * refetch returns extra rows. SSR already seeds `profileCodes`.
 */

/** Minimal shape the filter needs from a directory card. */
export type ManualFilterableCard = { profileCode: string };

/**
 * Build a code → pick-index map from the operator's manual codes. Trims blanks
 * and de-dupes (first occurrence wins). Returns `null` when nothing is picked,
 * which callers read as "manual filter inactive".
 */
export function buildManualCodeOrder(
  codes: readonly string[] | undefined,
): Map<string, number> | null {
  const cleaned = (codes ?? [])
    .map((c) => c.trim())
    .filter((c) => c.length > 0);
  if (cleaned.length === 0) return null;
  const order = new Map<string, number>();
  cleaned.forEach((c, i) => {
    if (!order.has(c)) order.set(c, i);
  });
  return order;
}

/**
 * Keep only cards whose `profileCode` is in `order`, de-duped (first wins),
 * sorted into the operator's pick order. `order=null` → return `cards` as-is
 * (manual filter inactive).
 */
export function filterToManualCodes<T extends ManualFilterableCard>(
  cards: readonly T[],
  order: Map<string, number> | null,
): T[] {
  if (!order) return [...cards];
  const seen = new Set<string>();
  return cards
    .filter((card) => {
      const code = card.profileCode;
      if (!code || !order.has(code) || seen.has(code)) return false;
      seen.add(code);
      return true;
    })
    .sort((a, b) => (order.get(a.profileCode) ?? 0) - (order.get(b.profileCode) ?? 0));
}
