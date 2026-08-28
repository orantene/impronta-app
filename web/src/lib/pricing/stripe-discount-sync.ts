/**
 * stripe-discount-sync.ts — server-only Stripe Coupon + Promotion Code sync
 * for the Commerce page's Discounts tab.
 *
 * Each `product_discounts` row corresponds to a Stripe Coupon + Promotion Code
 * pair:
 *   - `stripe.coupons.create` — the discount math (percent_off / amount_off /
 *     duration / which products it is valid on)
 *   - `stripe.promotionCodes.create` — the human-typed CODE, the redemption
 *     restrictions (first-time customers, minimum spend) and the link to the
 *     coupon
 *
 * THE MAPPING ITSELF LIVES IN `discount-stripe-params.ts` and is pure. It used
 * to be inline here, which is why it went unnoticed that percent and fixed
 * discounts were hardcoded to `duration: "once"` and that the per-tier
 * `applies_to` scope was never sent to Stripe at all. Both are fixed there and
 * pinned by `discount-coupon-mapping.characterization.test.ts`.
 *
 * Stubbed-safe (same pattern as stripe-sync.ts): when STRIPE_SECRET_KEY is
 * unset, returns `{ ok: true, stub: true, reason }` so the DB row is saved and
 * the operator sees a yellow "Saved in DB only — Stripe not connected" chip.
 * When the account is wired up, a re-sync backfills the Stripe IDs (the action
 * layer creates a new Coupon + Promo Code pair, the only safe shape — Stripe
 * Coupons are immutable once redeemed against).
 *
 * Mapping table:
 *   DB.kind         Stripe Coupon shape
 *   ──────────────  ─────────────────────────────────────────────
 *   percent         { percent_off: <value>, duration: <row> }
 *   fixed           { amount_off: <value*100>, currency, duration: <row> }
 *   free_months     { percent_off: 100, duration: "repeating",
 *                     duration_in_months: <months> }
 */

import "server-only";
import { getStripe, isStripeConfigured } from "@/lib/stripe/client";
import { logServerError } from "@/lib/server/safe-error";
import {
  buildDiscountCouponParams,
  buildDiscountPromotionCodeParams,
  type DiscountDuration,
  type DiscountKind,
} from "./discount-stripe-params";

export type DiscountSyncResult =
  | { ok: true; couponId: string; promotionCodeId: string; stub: false }
  | { ok: true; couponId: null; promotionCodeId: null; stub: true; reason: string }
  | { ok: false; error: string };

export type DiscountArchiveResult =
  | { ok: true; stub: false }
  | { ok: true; stub: true; reason: string }
  | { ok: false; error: string };

export type SyncDiscountInput = {
  code: string;
  name: string;
  kind: DiscountKind;
  /** For percent: 1-100. For fixed: major-unit amount (e.g. 10 = $10).
   *  For free_months: integer count of months (1-12). */
  value: number;
  /** Required when kind=fixed; ignored otherwise. ISO-4217 uppercase. */
  currency: string | null;
  duration: DiscountDuration;
  durationMonths: number | null;
  maxRedemptions: number | null;
  startsAt: string | null;
  endsAt: string | null;
  /**
   * Stripe PRODUCT ids to restrict the coupon to. Empty/undefined = valid on
   * every product. The caller resolves these from the tiers the operator
   * checked; it must refuse the save when a checked tier has no Stripe product
   * rather than passing a short list here, because a coupon with a missing
   * restriction is a coupon valid on everything.
   */
  productIds?: string[] | null;
  firstTimeOnly?: boolean | null;
  minimumAmountCents?: number | null;
  minimumAmountCurrency?: string | null;
};

/**
 * Create a Stripe Coupon + matching Promotion Code for a discount row.
 * Returns both IDs (or stub markers) for the caller to persist on the
 * `product_discounts` row.
 *
 * `code` is the human-typed redemption code (e.g. "LATAM50") — Stripe
 * normalizes to uppercase.
 *
 * `idempotencyKey` makes a retry after a timeout reuse the same Stripe objects
 * instead of minting a second coupon nobody can see. The action layer derives
 * it from the row id (`pdisc-{id}`), which is why the row is written FIRST.
 */
export async function syncDiscountToStripe(
  input: SyncDiscountInput,
  idempotencyKey?: string,
): Promise<DiscountSyncResult> {
  if (!isStripeConfigured()) {
    return {
      ok: true,
      couponId: null,
      promotionCodeId: null,
      stub: true,
      reason: "STRIPE_SECRET_KEY not set — saved in DB only.",
    };
  }

  const stripe = getStripe();
  if (!stripe) {
    return {
      ok: true,
      couponId: null,
      promotionCodeId: null,
      stub: true,
      reason: "Stripe client unavailable — saved in DB only.",
    };
  }

  const couponParams = buildDiscountCouponParams({
    name: input.name,
    kind: input.kind,
    value: input.value,
    currency: input.currency,
    duration: input.duration,
    durationMonths: input.durationMonths,
    maxRedemptions: input.maxRedemptions,
    endsAt: input.endsAt,
    productIds: input.productIds ?? null,
  });
  if (!couponParams.ok) return { ok: false, error: couponParams.error };

  try {
    const coupon = await stripe.coupons.create(
      couponParams.params,
      idempotencyKey ? { idempotencyKey: `${idempotencyKey}-coupon` } : undefined,
    );

    const promoParams = buildDiscountPromotionCodeParams({
      code: input.code,
      couponId: coupon.id,
      maxRedemptions: input.maxRedemptions,
      endsAt: input.endsAt,
      firstTimeOnly: input.firstTimeOnly ?? null,
      minimumAmountCents: input.minimumAmountCents ?? null,
      minimumAmountCurrency: input.minimumAmountCurrency ?? null,
    });
    if (!promoParams.ok) return { ok: false, error: promoParams.error };

    // `starts_at` has no Stripe home — a promotion code has `expires_at` and no
    // opening edge. `validateDiscount` honours the window server-side. Noted
    // here so its absence does not read as an oversight.
    const promo = await stripe.promotionCodes.create(
      promoParams.params,
      idempotencyKey ? { idempotencyKey: `${idempotencyKey}-promo` } : undefined,
    );

    return {
      ok: true,
      couponId: coupon.id,
      promotionCodeId: promo.id,
      stub: false,
    };
  } catch (err) {
    logServerError("stripe-discount-sync.create", err);
    const message = err instanceof Error ? err.message : "Stripe API error";
    // Common case: duplicate code. Re-surface verbatim so the UI can
    // tell the operator to pick a different code.
    return { ok: false, error: message };
  }
}

/**
 * Soft-delete: Stripe Coupons CAN be deleted (unlike Prices) but only
 * if they have no redemptions. Safer for our flow is to deactivate the
 * Promotion Code so the human code stops accepting new redemptions —
 * the underlying Coupon stays around for existing subscribers.
 */
export async function archiveDiscountInStripe(input: {
  stripePromotionCodeId: string | null;
}): Promise<DiscountArchiveResult> {
  if (!isStripeConfigured()) {
    return { ok: true, stub: true, reason: "STRIPE_SECRET_KEY not set." };
  }
  if (!input.stripePromotionCodeId) {
    return { ok: true, stub: true, reason: "No Stripe Promotion Code linked." };
  }
  const stripe = getStripe();
  if (!stripe) {
    return { ok: true, stub: true, reason: "Stripe client unavailable." };
  }
  try {
    await stripe.promotionCodes.update(input.stripePromotionCodeId, {
      active: false,
    });
    return { ok: true, stub: false };
  } catch (err) {
    logServerError("stripe-discount-sync.archive", err);
    const message = err instanceof Error ? err.message : "Stripe API error";
    return { ok: false, error: message };
  }
}
