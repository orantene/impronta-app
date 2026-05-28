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
  /** Phase 4 — when set, the compare-table cell renders this string
   *  (e.g., "Up to 50", "Full + white-label") instead of the ✓/—
   *  derived from `included`. Null for boolean-shaped rows. */
  valueText: string | null;
};

// ─── Compare-table shape (Phase 4) ────────────────────────────────────────────

/**
 * One row in the compare table. Cells are ordered by tier display_order
 * (free → studio → agency → hub for the workspace package).
 */
export type CompareTableRow = {
  label: string;
  category: string;
  /** Per-tier cell. `value` is the string when set; otherwise check
   *  `included` for ✓/—. `null` means the tier doesn't have a feature
   *  row for this (label, category) — render as —. */
  cells: Array<
    | { tierSlug: string; included: boolean; value: string | null }
    | { tierSlug: string; missing: true }
  >;
};

export type CompareTableSection = {
  /** Category slug (e.g. "pipeline"). Human label is derived in the UI. */
  category: string;
  rows: CompareTableRow[];
};

export type CompareTable = {
  /** Tier slugs in column order — matches `cells` order in every row. */
  tierSlugs: string[];
  /** Tier labels keyed by slug, for column headers. */
  tierLabels: Record<string, string>;
  sections: CompareTableSection[];
};

/** Human-readable label for a `product_features.category` slug. */
export const COMPARE_CATEGORY_LABEL: Record<string, string> = {
  pipeline:      "Inquiry → booking pipeline",
  notifications: "Notifications & messaging",
  roster_site:   "Roster & site",
  media:         "Media & branding",
  team_access:   "Team & access",
  network_data:  "Network & data",
};

/** Display order for compare-table sections — defines top-to-bottom
 *  rendering. Categories not in this list go after, alphabetized. */
export const COMPARE_CATEGORY_ORDER: string[] = [
  "pipeline",
  "notifications",
  "roster_site",
  "media",
  "team_access",
  "network_data",
];

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
 *
 * Phase 5: when an in-window SALE price exists for the preferred slot,
 * it wins over the canonical (null-window) price. So the headline price
 * automatically flips to the discounted amount during the sale.
 */
export function pickHeadlinePrice(
  prices: PricingPriceRow[],
  now: Date = new Date(),
): PricingPriceRow | null {
  const active = prices.filter((p) => p.isActive && !p.archivedAt);
  if (active.length === 0) return null;
  return (
    pickEffectivePrice(active, "USD", "month", now) ??
    pickEffectivePrice(active, "USD", "year", now) ??
    active[0] ??
    null
  );
}

/**
 * Phase 5 — given a flat list of active prices and a (currency × interval)
 * key, pick the row that should be ACTIVE at `now`:
 *
 *   1. In-window sale (valid_from <= now < valid_until)
 *   2. Canonical (valid_from === null AND valid_until === null)
 *
 * Returns `null` when neither matches. Sale rows that have ENDED or
 * haven't STARTED are skipped — they live in the table for audit but
 * never serve traffic.
 *
 * Window semantics:
 *   - valid_from null  → "open start"  (any time before valid_until)
 *   - valid_until null → "open end"    (any time after valid_from)
 *   - both null         → CANONICAL row, not a sale
 */
export function pickEffectivePrice(
  prices: PricingPriceRow[],
  currency: string,
  interval: PricingInterval,
  now: Date = new Date(),
): PricingPriceRow | null {
  const upper = currency.toUpperCase();
  const matching = prices.filter(
    (p) =>
      p.isActive &&
      !p.archivedAt &&
      p.currency.toUpperCase() === upper &&
      p.interval === interval,
  );
  if (matching.length === 0) return null;

  const nowMs = now.getTime();
  // 1. In-window sale (at least one of valid_from / valid_until is set).
  const inWindow = matching.find((p) => {
    if (p.validFrom === null && p.validUntil === null) return false;
    const startMs = p.validFrom ? new Date(p.validFrom).getTime() : -Infinity;
    const endMs = p.validUntil ? new Date(p.validUntil).getTime() : Infinity;
    return nowMs >= startMs && nowMs < endMs;
  });
  if (inWindow) return inWindow;

  // 2. Canonical (no window at all).
  const canonical = matching.find(
    (p) => p.validFrom === null && p.validUntil === null,
  );
  return canonical ?? null;
}

/**
 * Phase 5 — true when this price row is a sale (has any window set) AND
 * is currently active (in window). Used by UI to render the SALE badge.
 */
export function isSalePriceActive(
  price: PricingPriceRow,
  now: Date = new Date(),
): boolean {
  if (price.validFrom === null && price.validUntil === null) return false;
  const nowMs = now.getTime();
  const startMs = price.validFrom ? new Date(price.validFrom).getTime() : -Infinity;
  const endMs = price.validUntil ? new Date(price.validUntil).getTime() : Infinity;
  return nowMs >= startMs && nowMs < endMs;
}

/**
 * Format a sale-window into a short admin-facing label, e.g.
 *   "until 2026-12-31"      (no start)
 *   "from 2026-06-01"        (no end)
 *   "2026-06-01 → 2026-08-31" (full window)
 */
export function formatPriceWindow(price: PricingPriceRow): string {
  const fmt = (iso: string | null) =>
    iso ? new Date(iso).toISOString().slice(0, 10) : null;
  const s = fmt(price.validFrom);
  const e = fmt(price.validUntil);
  if (!s && !e) return "always";
  if (s && !e) return `from ${s}`;
  if (!s && e) return `until ${e}`;
  return `${s} → ${e}`;
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
