/**
 * totals.ts — the arithmetic of a draft order, as a pure function.
 *
 * F3. Every amount on an order is INTEGER CENTS and every total is derived,
 * never stored independently: `orders_total_is_derived` in the database asserts
 * `total_cents = subtotal_cents - discount_cents + tax_cents`, so a writer that
 * computes these differently does not get a wrong row, it gets a rejected one.
 * This module is the single place that arithmetic happens on my side.
 *
 * WHAT THIS DELIBERATELY DOES NOT DO
 * ──────────────────────────────────
 * It does not price anything. `unit_cents` arrives from the offering, variant
 * and add-on rows that the Orders pipeline reads at submit; the Sheet never
 * sends a price and this never invents one. Recomputing a price here would be
 * a second source of truth for money, which is exactly what the shared contract
 * with Orders forbids.
 *
 * Tax is a placeholder that stays zero until the Mexico tax rule is decided
 * (board decision D5, blocked on an adviser). It is threaded through rather
 * than omitted so the day it becomes non-zero is a value change, not a schema
 * change.
 */

export type CartLineInput = {
  /** Integer cents. Never a float, never a string. */
  readonly unitCents: number;
  /** How many. Whole units; the column is numeric but nothing sells 1.5 seats. */
  readonly units: number;
  /** Integer cents, zero until D5 lands. */
  readonly taxCents?: number;
};

export type CartTotals = {
  readonly subtotalCents: number;
  readonly discountCents: number;
  readonly taxCents: number;
  readonly totalCents: number;
};

export const EMPTY_TOTALS: CartTotals = {
  subtotalCents: 0,
  discountCents: 0,
  taxCents: 0,
  totalCents: 0,
};

/** A line's own total. Exported because `order_lines.total_cents` stores it. */
export function lineTotalCents(line: CartLineInput): number {
  if (!Number.isFinite(line.unitCents) || !Number.isFinite(line.units)) return 0;
  const units = Math.max(0, Math.trunc(line.units));
  // A negative price is clamped, not passed through. The database requires
  // every order amount non-negative, so a negative line would not be stored
  // wrongly, it would be REJECTED — turning a bad input into a 500 at the write
  // instead of a caught condition here.
  const unit = Math.max(0, Math.trunc(line.unitCents));
  if (units === 0 || unit === 0) return 0;
  return unit * units;
}

/**
 * Roll lines up into the four amounts the `orders` row stores.
 *
 * `discountCents` is clamped so it can never exceed the subtotal: the database
 * requires every amount non-negative AND the total to equal
 * `subtotal - discount + tax`, so an over-large discount would otherwise
 * produce a negative total and a rejected write. Clamping here turns a bad
 * promo into a free order rather than a 500.
 */
export function cartTotals(
  lines: readonly CartLineInput[],
  discountCents = 0,
): CartTotals {
  let subtotal = 0;
  let tax = 0;
  for (const line of lines) {
    subtotal += lineTotalCents(line);
    const lineTax = line.taxCents;
    if (typeof lineTax === "number" && Number.isFinite(lineTax)) {
      tax += Math.max(0, Math.trunc(lineTax));
    }
  }

  const discount = Number.isFinite(discountCents)
    ? Math.min(Math.max(0, Math.trunc(discountCents)), subtotal)
    : 0;

  return {
    subtotalCents: subtotal,
    discountCents: discount,
    taxCents: tax,
    totalCents: subtotal - discount + tax,
  };
}

/**
 * Does this set of amounts satisfy what the database will check?
 *
 * Used by the writer before it writes, so a mistake surfaces as a caught error
 * with a name rather than a PostgREST constraint violation the caller has to
 * decode. Mirrors `orders_amounts_nonneg` and `orders_total_is_derived`.
 */
export function totalsAreWritable(totals: CartTotals): boolean {
  const values = [
    totals.subtotalCents,
    totals.discountCents,
    totals.taxCents,
    totals.totalCents,
  ];
  if (!values.every((v) => Number.isInteger(v) && v >= 0)) return false;
  return (
    totals.totalCents ===
    totals.subtotalCents - totals.discountCents + totals.taxCents
  );
}

/**
 * What is actually due now, given a deposit percentage.
 *
 * Lives here rather than in the Sheet because it is money maths, and the one
 * place money maths must not live is a component. The Sheet asked for this and
 * the honest answer was to put it where the rest of the cents already are.
 *
 * `depositPct` is null when the whole amount is due, which is the common case
 * and must not be a special case at every call site.
 *
 * Three properties a purchase depends on:
 *   - integer cents out, always; a half-cent deposit cannot be charged
 *   - never more than the total, so a bad percentage cannot overcharge
 *   - never negative, so it cannot become a refund by arithmetic
 */
export function depositDueCents(
  totals: CartTotals,
  depositPct: number | null,
): number {
  const total = Math.max(0, Math.trunc(totals.totalCents));
  if (depositPct === null || !Number.isFinite(depositPct) || depositPct <= 0) {
    return total;
  }
  // A percentage at or above 100 means the whole amount, not more than it.
  if (depositPct >= 100) return total;
  return Math.min(total, Math.max(0, Math.round((total * depositPct) / 100)));
}
