/**
 * pricing-types.ts — pure types + format helpers for the Product Pricing
 * dashboard.
 *
 * NO `server-only` marker. Client components import types AND helpers
 * (`formatUnitAmount`, `centsForUSD`, etc.) from here. The matching
 * server-only loader lives in `get-product-catalog.ts` per the split
 * pattern established by `earnings-by-currency-types.ts` (PR #46).
 */
import { CURRENCY_LABELS, type DefaultCurrencyCode } from "@/lib/billing/currencies";

export type PricingFamily = "workspace" | "talent" | "client";
export type PricingInterval = "month" | "year" | "once" | "lifetime";

/**
 * One row in `public.product_prices`. `unit_amount` is in the smallest
 * currency unit (cents for USD, centavos for MXN, etc.).
 */
export type PricingPriceRow = {
  id: string;
  tierId: string;
  currency: DefaultCurrencyCode | string;
  interval: PricingInterval;
  unitAmount: number;
  stripePriceId: string | null;
  isActive: boolean;
  archivedAt: string | null;
  validFrom: string | null;
  validUntil: string | null;
  notes: string | null;
  updatedAt: string;
};

export type PricingFeatureRow = {
  id: string;
  tierId: string;
  label: string;
  included: boolean;
  highlight: boolean;
  displayOrder: number;
  category: string | null;
};

export type PricingTierRow = {
  id: string;
  packageId: string;
  slug: string;
  name: string;
  tagline: string | null;
  description: string | null;
  displayOrder: number;
  isActive: boolean;
  isFeatured: boolean;
  stripeProductId: string | null;
  updatedAt: string;
  prices: PricingPriceRow[];
  features: PricingFeatureRow[];
};

export type PricingPackageRow = {
  id: string;
  slug: string;
  family: PricingFamily;
  label: string;
  description: string | null;
  displayOrder: number;
  isActive: boolean;
  tiers: PricingTierRow[];
};

export type PricingCatalog = {
  packages: PricingPackageRow[];
  /** Fetched-at ISO timestamp; renderer uses for "Last refreshed …". */
  loadedAt: string;
};

export type PricingDiscountRow = {
  id: string;
  code: string;
  name: string;
  kind: "percent" | "fixed" | "free_months";
  value: number;
  currency: string | null;
  appliesTo: "all" | string[];
  maxRedemptions: number | null;
  redemptionCount: number;
  perCustomerLimit: number;
  startsAt: string | null;
  endsAt: string | null;
  stripeCouponId: string | null;
  stripePromotionCodeId: string | null;
  isActive: boolean;
};

// ─── Stripe-account info (read-only ping of /v1/account) ─────────────────────

export type StripeAccountInfo = {
  ok: true;
  accountId: string;
  displayName: string | null;
  businessName: string | null;
  email: string | null;
  country: string | null;
  chargesEnabled: boolean;
  testMode: boolean;
  fetchedAt: string;
} | {
  ok: false;
  error: string;
  /** "no-key" when STRIPE_SECRET_KEY is missing; "bad-key" / "api-error" otherwise. */
  reason: "no-key" | "bad-key" | "api-error";
  fetchedAt: string;
};

// ─── FX preview (Frankfurter daily ECB rates) ────────────────────────────────

export type FxPreview = {
  ok: true;
  base: "USD";
  fetchedAt: string;
  /** ISO date string from Frankfurter (rates valid for this day). */
  rateDate: string;
  /** Map of currency code → rate vs USD. ARS/COP/CLP/PEN are NOT included
   *  (ECB doesn't quote them); the UI shows "—" with a tooltip. */
  rates: Record<string, number>;
} | {
  ok: false;
  error: string;
  fetchedAt: string;
};

/**
 * Currencies the FX widget knows ECB does NOT cover; render as "—" with
 * a tooltip. Open Exchange Rates is the planned Phase 1+ enhancement.
 */
export const ECB_UNCOVERED_CURRENCIES = ["ARS", "COP", "CLP", "PEN"] as const;

// ─── Formatters ──────────────────────────────────────────────────────────────

/**
 * Render a unit_amount + currency as e.g. "$49.00" or "MX$849.00".
 * `unitAmount` is in the smallest currency unit (cents/centavos).
 */
export function formatUnitAmount(
  unitAmount: number,
  currency: string,
): string {
  // Most ISO codes are 2-decimal; Intl.NumberFormat handles the divisor.
  // We assume cents-style. (Stripe zero-decimal currencies like JPY would
  // need special handling — none in our v1 list.)
  const decimals = 2;
  const value = unitAmount / Math.pow(10, decimals);
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currency.toUpperCase(),
      minimumFractionDigits: value % 1 === 0 ? 0 : decimals,
      maximumFractionDigits: decimals,
    }).format(value);
  } catch {
    // Unknown currency → fall back to plain amount + code suffix
    return `${value.toFixed(2)} ${currency.toUpperCase()}`;
  }
}

/** Currency code → human label, e.g. "USD · $ · US Dollar". */
export function currencyLabel(code: string): string {
  const upper = code.toUpperCase();
  return CURRENCY_LABELS[upper as DefaultCurrencyCode] ?? upper;
}

/**
 * For a tier's prices, pick the canonical (currency × interval) row to
 * display on the card. Preference: USD/month > USD/year > first active row.
 * Returns `null` if the tier has no active prices (e.g., the Free tier).
 */
export function pickHeadlinePrice(
  prices: PricingPriceRow[],
): PricingPriceRow | null {
  const active = prices.filter(
    (p) => p.isActive && !p.archivedAt,
  );
  if (active.length === 0) return null;
  const usdMonth = active.find(
    (p) => p.currency.toUpperCase() === "USD" && p.interval === "month",
  );
  if (usdMonth) return usdMonth;
  const usdYear = active.find(
    (p) => p.currency.toUpperCase() === "USD" && p.interval === "year",
  );
  if (usdYear) return usdYear;
  return active[0] ?? null;
}

/** Human suffix for an interval, used after the amount: "$49 / mo". */
export function intervalSuffix(interval: PricingInterval): string {
  switch (interval) {
    case "month":    return "/ mo";
    case "year":     return "/ yr";
    case "once":     return "one-time";
    case "lifetime": return "one-time";
  }
}
