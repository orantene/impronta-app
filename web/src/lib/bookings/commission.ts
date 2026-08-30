/**
 * lib/bookings/commission.ts
 *
 * Integer-safe money math and formatting for booking transactions.
 *
 * THIS MODULE NO LONGER DECIDES RATES (2026-08-30)
 * ────────────────────────────────────────────────
 * It used to carry its own plan-tier fee table — free 0, studio 1100, agency
 * 1750, network 1750 — while calling itself "the single source of truth". The
 * canonical engine (`@/lib/billing/commission`) meanwhile resolved every tier
 * from `platform_commission_config`, whose ratified default is 600 bps (6%).
 * The two disagreed, and the divergent table was reachable from real money via
 * the `createBookingTransaction` no-snapshot fallback, where a hardcoded
 * `planTier: "agency"` billed 17.5% instead of 6%.
 *
 * Rates now come from exactly one place:
 *   - With a booking in hand: `persistBookingCommissionSnapshot`, which applies
 *     the full override hierarchy and is what payouts read.
 *   - Without one (legacy fallback, or "what does this plan pay" display):
 *     `loadPlatformTakeBps` from `@/lib/billing/platform-take-rate`.
 *
 * What remains here is arithmetic and presentation, which had no divergence:
 * basis points × gross ÷ 10000, floored so we never over-charge, and currency
 * formatting. Do not reintroduce a tier→rate map in this file.
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export type TransactionAmounts = {
  grossCents: number;
  feeBasisPoints: number;
  feeCents: number;
  netCents: number;
};

// ─── Core functions ───────────────────────────────────────────────────────────

/**
 * Returns a human-readable fee percentage string (e.g. "6%", "17.5%").
 */
export function feePercent(basisPoints: number): string {
  const pct = basisPoints / 100;
  return pct % 1 === 0 ? `${pct}%` : `${pct.toFixed(1)}%`;
}

/**
 * Calculates gross / fee / net amounts from an already-resolved fee rate.
 *
 * Fee is floored (rounded down) so rounding never over-charges the payer.
 * Invariant: fee + net = gross.
 *
 * The caller resolves the rate — see the module header. There is deliberately no
 * `(gross, planTier)` overload any more, because that signature is what let a
 * second rate table exist.
 */
export function calculateTransactionAmountsForBasisPoints(
  grossCents: number,
  feeBasisPoints: number,
): TransactionAmounts {
  if (grossCents <= 0) {
    throw new Error(`calculateTransactionAmounts: grossCents must be > 0, got ${grossCents}`);
  }
  if (!Number.isInteger(feeBasisPoints) || feeBasisPoints < 0) {
    throw new Error(
      `calculateTransactionAmounts: feeBasisPoints must be a non-negative integer, got ${feeBasisPoints}`,
    );
  }
  const feeCents = Math.floor((grossCents * feeBasisPoints) / 10_000);
  const netCents = grossCents - feeCents;
  return { grossCents, feeBasisPoints, feeCents, netCents };
}

/**
 * Formats cents using the provided ISO currency code.
 *
 * M14: locale defaults to `undefined` so the runtime picks the browser/OS
 * default on the client and "en" on the server. Pass an explicit BCP 47
 * locale tag (e.g. "de-DE") when you need deterministic server-side output
 * for a specific locale.
 */
export function formatCents(cents: number, currency: string, locale?: string): string {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: currency || "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(cents / 100);
}

/**
 * Formats cents as a USD string (e.g. "$1,234.56").
 * Used in UI components and server-rendered fee breakdowns.
 */
export function formatCentsUSD(cents: number): string {
  return formatCents(cents, "USD");
}
