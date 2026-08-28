/**
 * discount-stripe-params.ts — the row → Stripe params mapping for code
 * discounts, as PURE functions.
 *
 * WHY THIS IS ITS OWN FILE: the mapping is the part that silently bills the
 * wrong amount when it drifts, and it used to sit inline in the middle of
 * `stripe-discount-sync.ts` between two `await`s — untestable without a Stripe
 * key, so nothing tested it. Two bugs lived there as a result:
 *
 *   1. `duration` was HARDCODED to "once" for percent and fixed discounts. The
 *      admin form offered no duration field, so "30% off for three months"
 *      could not be expressed at all, and every percent code silently became a
 *      one-invoice discount. The `duration` / `duration_months` columns now
 *      carry the operator's choice and this maps them through.
 *   2. `applies_to` — the per-tier scope the admin has always stored — was
 *      never sent to Stripe, so every coupon was valid on EVERY product. A
 *      "50% off the Studio plan" code discounted the Network plan too. Stripe
 *      has `coupon.applies_to.products` natively; our
 *      `product_tiers.stripe_product_id` is exactly its input.
 *
 * `free_months` is not a third Stripe shape: it always WAS percent 100 /
 * repeating / N months. The columns now say so instead of the code implying it.
 *
 * No `server-only` import and no Stripe client here on purpose — these are
 * plain data transforms, so `discount-coupon-mapping.characterization.test.ts`
 * can pin them without a network or a key.
 */

import type Stripe from "stripe";

export type DiscountKind = "percent" | "fixed" | "free_months";
export type DiscountDuration = "once" | "repeating" | "forever";

/** One `product_discounts` row, in the shape the mapping needs. */
export type DiscountCouponInput = {
  name: string;
  kind: DiscountKind;
  /** percent: 1-100 · fixed: MAJOR units (10 = $10) · free_months: months. */
  value: number;
  /** Required when kind=fixed. ISO-4217. */
  currency: string | null;
  duration: DiscountDuration;
  durationMonths?: number | null;
  maxRedemptions?: number | null;
  endsAt?: string | null;
  /**
   * Stripe PRODUCT ids (`prod_…`) this coupon is restricted to. Null or empty
   * means "every product" — the deliberate, explicit form of unrestricted.
   * Callers resolve these from `product_tiers.stripe_product_id`; a tier with
   * no Stripe product cannot be scoped and must be refused UPSTREAM rather
   * than dropped here, because a silently unrestricted coupon is money.
   */
  productIds?: string[] | null;
};

export type DiscountPromotionCodeInput = {
  code: string;
  couponId: string;
  maxRedemptions?: number | null;
  endsAt?: string | null;
  firstTimeOnly?: boolean | null;
  minimumAmountCents?: number | null;
  minimumAmountCurrency?: string | null;
  /** Restrict the code to a single Stripe customer (`cus_…`). */
  customerId?: string | null;
};

export type ParamsResult<T> =
  | { ok: true; params: T }
  | { ok: false; error: string };

function unixSeconds(iso: string): number {
  return Math.floor(new Date(iso).getTime() / 1000);
}

/**
 * Map a discount row onto `stripe.coupons.create` params.
 *
 * Returns a result rather than throwing so the action layer can surface the
 * message verbatim to the operator ("Fixed discounts require a currency")
 * instead of a 500.
 */
export function buildDiscountCouponParams(
  input: DiscountCouponInput,
): ParamsResult<Stripe.CouponCreateParams> {
  const params: Stripe.CouponCreateParams = { name: input.name };

  if (input.maxRedemptions != null) {
    params.max_redemptions = input.maxRedemptions;
  }
  if (input.endsAt) {
    params.redeem_by = unixSeconds(input.endsAt);
  }

  if (input.kind === "free_months") {
    // Always was, and remains, "N months of 100% off". The row's own duration
    // columns are deliberately ignored for this kind, so a row written before
    // those columns existed (where `duration` defaulted to 'once') cannot turn
    // a three-months-free campaign into one free invoice.
    const months = Math.max(1, Math.round(input.durationMonths ?? input.value));
    params.percent_off = 100;
    params.duration = "repeating";
    params.duration_in_months = months;
  } else {
    params.duration = input.duration;
    if (input.duration === "repeating") {
      const months = input.durationMonths;
      if (!months || months < 1) {
        return {
          ok: false,
          error: "A repeating discount needs a number of months.",
        };
      }
      params.duration_in_months = Math.round(months);
    }

    if (input.kind === "percent") {
      params.percent_off = input.value;
    } else {
      if (!input.currency) {
        return { ok: false, error: "Fixed discounts require a currency." };
      }
      params.amount_off = Math.round(input.value * 100);
      params.currency = input.currency.toLowerCase();
    }
  }

  const products = (input.productIds ?? []).filter(
    (id) => typeof id === "string" && id.trim().length > 0,
  );
  if (products.length > 0) {
    params.applies_to = { products };
  }

  return { ok: true, params };
}

/**
 * Map a discount row onto `stripe.promotionCodes.create` params.
 *
 * `restrictions` is where the ecommerce options the admin now offers actually
 * get ENFORCED — by Stripe, at redemption, rather than by us re-deriving the
 * rule at checkout and hoping every entry point remembered to.
 *
 * There is no `starts_at` on a Stripe promotion code. The window's opening edge
 * stays app-side in `validateDiscount`; only the closing edge (`expires_at`)
 * has a Stripe home. That is a Stripe limitation, not an oversight.
 */
export function buildDiscountPromotionCodeParams(
  input: DiscountPromotionCodeInput,
): ParamsResult<Stripe.PromotionCodeCreateParams> {
  const code = input.code.trim().toUpperCase();
  if (!code) return { ok: false, error: "A promotion code needs a code." };

  const params: Stripe.PromotionCodeCreateParams = {
    // SDK v22 nests the coupon link under `promotion`; the flat `coupon` field
    // in older docs no longer exists.
    promotion: { coupon: input.couponId, type: "coupon" },
    code,
  };

  if (input.maxRedemptions != null) {
    params.max_redemptions = input.maxRedemptions;
  }
  if (input.endsAt) {
    params.expires_at = unixSeconds(input.endsAt);
  }
  if (input.customerId) {
    params.customer = input.customerId;
  }

  const restrictions: Stripe.PromotionCodeCreateParams.Restrictions = {};
  let hasRestriction = false;
  if (input.firstTimeOnly) {
    restrictions.first_time_transaction = true;
    hasRestriction = true;
  }
  if (input.minimumAmountCents != null && input.minimumAmountCents > 0) {
    if (!input.minimumAmountCurrency) {
      return { ok: false, error: "A minimum spend needs a currency." };
    }
    restrictions.minimum_amount = Math.round(input.minimumAmountCents);
    restrictions.minimum_amount_currency =
      input.minimumAmountCurrency.toLowerCase();
    hasRestriction = true;
  }
  if (hasRestriction) params.restrictions = restrictions;

  return { ok: true, params };
}
