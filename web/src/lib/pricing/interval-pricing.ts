/**
 * interval-pricing.ts: pure monthly/yearly price resolution for the /pricing
 * billing toggle (TUL-828).
 *
 * Yearly amounts come from the catalog (`product_prices` rows with
 * `interval = 'year'`) whenever such a row exists for the tier. When it does
 * not, the yearly figure is DERIVED from the monthly catalog row using
 * `YEARLY_PLACEHOLDER_CONFIG` below and tagged `source: "placeholder"`.
 *
 * PLACEHOLDER: the multiplier mirrors the published "ten months for twelve"
 * promise. It is display only. It never writes a price, never reaches Stripe,
 * and real yearly prices are held for the owner. Seed a yearly catalog row and
 * the placeholder stops being used for that tier with no code change.
 */
export type BillingInterval = "month" | "year";

export const DEFAULT_BILLING_INTERVAL: BillingInterval = "month";

export const YEARLY_PLACEHOLDER_CONFIG = {
  /** PLACEHOLDER: true until real yearly rows are seeded in the catalog. */
  isPlaceholder: true,
  /** Months charged for a year of service ("ten months for twelve"). */
  monthsChargedPerYear: 10,
} as const;

export type IntervalPriceInput = {
  interval: string;
  unitAmount: number;
  currency: string;
};

export type ResolvedIntervalPrice = {
  interval: BillingInterval;
  /** Amount billed per interval, in minor units. */
  unitAmount: number;
  /** Monthly equivalent, in minor units (equals unitAmount for monthly). */
  perMonthAmount: number;
  currency: string;
  source: "catalog" | "placeholder";
};

export function resolveIntervalPrice(
  prices: readonly IntervalPriceInput[],
  interval: BillingInterval,
): ResolvedIntervalPrice | null {
  const monthly = prices.find((p) => p.interval === "month");
  if (interval === "month") {
    if (!monthly) return null;
    return {
      interval,
      unitAmount: monthly.unitAmount,
      perMonthAmount: monthly.unitAmount,
      currency: monthly.currency,
      source: "catalog",
    };
  }
  const yearly = prices.find((p) => p.interval === "year");
  if (yearly) {
    return {
      interval,
      unitAmount: yearly.unitAmount,
      perMonthAmount: Math.round(yearly.unitAmount / 12),
      currency: yearly.currency,
      source: "catalog",
    };
  }
  if (!monthly) return null;
  const unitAmount =
    monthly.unitAmount * YEARLY_PLACEHOLDER_CONFIG.monthsChargedPerYear;
  return {
    interval,
    unitAmount,
    perMonthAmount: Math.round(unitAmount / 12),
    currency: monthly.currency,
    source: "placeholder",
  };
}

/** Whole-percent saving of paying yearly vs twelve monthly payments. */
export function yearlySavingsPercent(
  monthlyAmount: number,
  yearlyAmount: number,
): number {
  const full = monthlyAmount * 12;
  if (full <= 0 || yearlyAmount >= full || yearlyAmount < 0) return 0;
  return Math.round(((full - yearlyAmount) / full) * 100);
}

/** Largest saving across tiers, for the "Save up to N%" toggle badge. */
export function maxYearlySavingsPercent(
  pairs: readonly { monthly: number; yearly: number }[],
): number {
  return pairs.reduce(
    (max, p) => Math.max(max, yearlySavingsPercent(p.monthly, p.yearly)),
    0,
  );
}

export function parseBillingInterval(value: unknown): BillingInterval {
  return value === "year" ? "year" : DEFAULT_BILLING_INTERVAL;
}
