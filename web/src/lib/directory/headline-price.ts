/**
 * Pick the ONE price from a talent's services catalog that belongs on their
 * directory card.
 *
 * Pure + directive-free so it is unit-testable and shareable.
 *
 * WHY THIS IS NOT `MIN(amount_cents)`
 * The card chip used to show the cheapest line item in the catalog. On the
 * live roster that made it actively misleading for the only two talents who
 * had actually filled a catalog in:
 *
 *   More — catalog: casting session $80, half-day $350, e-commerce day from
 *   $500, full-day $600 (FEATURED), licensing buyout (quote).
 *   Card said "From $80" — a 30-minute casting fee. A client scanning the
 *   grid concluded she was a cheap model; her day rate is $600.
 *
 *   Popi — extra hour $120, DJ set $400 (FEATURED), wedding package $900.
 *   Card said "From $120" — an add-on hour, not a booking.
 *
 * Both had already flagged their headline service. The chip ignored it. So the
 * feature was at its worst for exactly the people who did the work.
 *
 * PRECEDENCE
 *   1. The offering the talent marked FEATURED — they told us their headline.
 *   2. Else the cheapest BOOKABLE unit (a day, an event, a package…), never an
 *      add-on like "extra hour" or "casting session".
 *   3. Else the cheapest priced offering at all — for a catalog that is
 *      genuinely all hourly, hourly IS the rate.
 *
 * Quote-only / custom-priced rows never reach here: they carry no number and
 * are filtered upstream (see price-from.ts), which also protects a talent's
 * deliberate "ask me" from being spoken over.
 */

/** Pricing units that represent an actual engagement a client can book. */
export const BOOKABLE_PRICE_TYPES = new Set([
  "day",
  "half_day",
  "week",
  "event",
  "flat_package",
]);

export type CatalogPriceRow = {
  amountCents: number;
  currency: string;
  priceType: string;
  isFeatured: boolean;
};

export type HeadlinePrice = { amountCents: number; currency: string };

function cheapest(rows: CatalogPriceRow[]): HeadlinePrice | null {
  let best: CatalogPriceRow | null = null;
  for (const row of rows) {
    if (!best || row.amountCents < best.amountCents) best = row;
  }
  // Currency is taken from the winning row verbatim — amounts are never
  // converted, so a mixed-currency catalog can't produce a fabricated total.
  return best ? { amountCents: best.amountCents, currency: best.currency } : null;
}

export function pickHeadlinePrice(
  rows: readonly CatalogPriceRow[],
): HeadlinePrice | null {
  const priced = rows.filter((r) => Number.isFinite(r.amountCents) && r.amountCents > 0);
  if (priced.length === 0) return null;

  const featured = priced.filter((r) => r.isFeatured);
  if (featured.length > 0) return cheapest(featured);

  const bookable = priced.filter((r) => BOOKABLE_PRICE_TYPES.has(r.priceType));
  if (bookable.length > 0) return cheapest(bookable);

  return cheapest(priced);
}
