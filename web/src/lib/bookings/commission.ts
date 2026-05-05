/**
 * lib/bookings/commission.ts
 *
 * Platform commission (fee) calculation for booking transactions.
 *
 * Binding source: docs/transaction-architecture.md + memory/project_agency_exclusivity_model.md
 *
 * Plan-tier → fee basis points mapping (1000 = 10.00%):
 *   free           →   0 bp  (0.00% — friend-link / no exclusivity case)
 *   studio         → 1100 bp (11.00% — mid-point of 10–12% range)
 *   agency         → 1750 bp (17.50% — mid-point of 15–20% range)
 *   network        → 1750 bp (same as agency for now; revisit when network plan ships)
 *
 * These values live here as defaults. When a platform-config table is added
 * (Phase X), the evaluator will read from DB instead. Until then, this module
 * is the single source of truth — update here, nowhere else.
 *
 * All calculations are integer-safe (basis points × gross ÷ 10000, rounded down
 * to avoid over-charging). net = gross − fee.
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export type PlanTier = "free" | "studio" | "agency" | "network";

export type TransactionAmounts = {
  grossCents: number;
  feeBasisPoints: number;
  feeCents: number;
  netCents: number;
};

// ─── Fee table ────────────────────────────────────────────────────────────────

const FEE_TABLE: Record<PlanTier, number> = {
  free:    0,
  studio:  1100,  // 11.00%
  agency:  1750,  // 17.50%
  network: 1750,  // 17.50%
} as const;

/**
 * Fallback for unrecognised plan tier strings.
 * M15: must be 0 (free) — unknown plan = no fee (safe fail-open).
 * If we don't recognise the plan, charging the studio rate (1100) would be
 * incorrect; silently under-charging is far safer than over-charging.
 */
const DEFAULT_FEE_BASIS_POINTS = 0;

// ─── Core functions ───────────────────────────────────────────────────────────

/**
 * Returns fee basis points for a plan tier string.
 * Unknown strings fall back to 0 bp (free / no fee) as a safe default.
 */
export function getFeeBasisPoints(planTier: string): number {
  return FEE_TABLE[planTier as PlanTier] ?? DEFAULT_FEE_BASIS_POINTS;
}

/**
 * Returns a human-readable fee percentage string (e.g. "11%", "17.5%").
 */
export function feePercent(basisPoints: number): string {
  const pct = basisPoints / 100;
  return pct % 1 === 0 ? `${pct}%` : `${pct.toFixed(1)}%`;
}

/**
 * Calculates gross / fee / net amounts given a gross price and plan tier.
 *
 * Fee is floored (rounded down) to avoid over-charging.
 * Asserts: net + fee = gross.
 *
 * @param grossCents  Total amount charged to the client, in cents.
 * @param planTier    The workspace plan tier string from agencies.plan_tier.
 */
export function calculateTransactionAmounts(
  grossCents: number,
  planTier: string,
): TransactionAmounts {
  const feeBasisPoints = getFeeBasisPoints(planTier);
  return calculateTransactionAmountsForBasisPoints(grossCents, feeBasisPoints);
}

/**
 * Calculates gross / fee / net amounts when the fee rate is already resolved.
 * Use this in UI/data paths that load the plan context once and pass the
 * snapshotted basis points down to repeated rows.
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
