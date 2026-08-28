/**
 * discount-row.ts — the ONE column list and the ONE snake→camel normalizer for
 * `product_discounts`.
 *
 * Before this there were two: `loadProductDiscounts` (the admin list) and
 * `validateDiscount` (the public `?promo=` check) each hand-wrote their own
 * `.select(...)` string and their own row mapper. They drifted the moment new
 * columns landed — the reader that forgot a column did not fail, it just saw
 * `undefined` and silently behaved as if the operator had never set the field.
 * A discount surface where "I set it" and "it applies" can disagree is exactly
 * the bug class this whole pass exists to kill, so the shape is stated once.
 *
 * Pure: no `server-only`, no client. Callers supply the raw row.
 */

import type { PricingDiscountRow } from "./pricing-types";

export const PRODUCT_DISCOUNT_SELECT =
  "id, code, name, kind, value, currency, applies_to, applies_family, duration, duration_months, max_redemptions, redemption_count, per_customer_limit, starts_at, ends_at, first_time_only, minimum_amount_cents, minimum_amount_currency, campaign, source, stripe_coupon_id, stripe_promotion_code_id, is_active";

/** The raw Supabase row for the select above. */
export type RawProductDiscountRow = {
  id: string;
  code: string;
  name: string;
  kind: string;
  value: number | string;
  currency: string | null;
  applies_to: unknown;
  applies_family: string | null;
  duration: string;
  duration_months: number | null;
  max_redemptions: number | null;
  redemption_count: number;
  per_customer_limit: number;
  starts_at: string | null;
  ends_at: string | null;
  first_time_only: boolean | null;
  minimum_amount_cents: number | string | null;
  minimum_amount_currency: string | null;
  campaign: string | null;
  source: string | null;
  stripe_coupon_id: string | null;
  stripe_promotion_code_id: string | null;
  is_active: boolean;
};

export function normalizeProductDiscount(
  raw: RawProductDiscountRow,
): PricingDiscountRow {
  const kind: PricingDiscountRow["kind"] =
    raw.kind === "percent" || raw.kind === "fixed" || raw.kind === "free_months"
      ? raw.kind
      : "percent";

  // `applies_to` is jsonb: the string "all" or an array of `product_tiers.id`.
  // Anything else (null, a stray object) reads as unrestricted, which is the
  // only safe default for a READ — the write path is where a bad scope is
  // refused.
  const appliesTo: "all" | string[] = Array.isArray(raw.applies_to)
    ? (raw.applies_to as string[]).filter((v) => typeof v === "string")
    : "all";

  const duration: PricingDiscountRow["duration"] =
    raw.duration === "repeating" || raw.duration === "forever"
      ? raw.duration
      : "once";

  const appliesFamily: PricingDiscountRow["appliesFamily"] =
    raw.applies_family === "workspace" || raw.applies_family === "talent"
      ? raw.applies_family
      : null;

  return {
    id: raw.id,
    code: raw.code,
    name: raw.name,
    kind,
    value: Number(raw.value),
    currency: raw.currency,
    appliesTo,
    appliesFamily,
    duration,
    durationMonths: raw.duration_months,
    maxRedemptions: raw.max_redemptions,
    redemptionCount: raw.redemption_count,
    perCustomerLimit: raw.per_customer_limit,
    startsAt: raw.starts_at,
    endsAt: raw.ends_at,
    firstTimeOnly: raw.first_time_only === true,
    minimumAmountCents:
      raw.minimum_amount_cents == null ? null : Number(raw.minimum_amount_cents),
    minimumAmountCurrency: raw.minimum_amount_currency,
    campaign: raw.campaign,
    source: raw.source === "stripe_import" ? "stripe_import" : "admin",
    stripeCouponId: raw.stripe_coupon_id,
    stripePromotionCodeId: raw.stripe_promotion_code_id,
    isActive: raw.is_active,
  };
}
