/**
 * stripe-discount-sync.ts — server-only Stripe Coupon + Promotion Code
 * sync for the Product Pricing dashboard's Discounts tab (L50 Phase 3).
 *
 * Each `product_discounts` row corresponds to a Stripe Coupon + Promotion
 * Code pair:
 *   - `stripe.coupons.create` — defines the discount math (percent_off /
 *     amount_off / duration)
 *   - `stripe.promotionCodes.create` — defines the human-typed `CODE`
 *     and links it to the coupon
 *
 * Stubbed-safe (same pattern as stripe-sync.ts): when STRIPE_SECRET_KEY
 * is unset, returns `{ ok: true, stub: true, reason }` so the DB row is
 * saved and the operator sees a yellow "Saved in DB only — Stripe not
 * connected" chip. When the right account is wired up, a re-sync can
 * backfill the Stripe IDs (the action layer creates a new Coupon +
 * Promo Code pair, which is the only safe shape — Stripe Coupons are
 * immutable once redeemed against).
 *
 * Mapping table:
 *   DB.kind         Stripe Coupon shape
 *   ──────────────  ─────────────────────────────────────────────
 *   percent         { percent_off: <value> }              one-off
 *   fixed           { amount_off: <value*100>,            one-off
 *                     currency: <currency> }
 *   free_months     { duration: "repeating",              recurring
 *                     duration_in_months: <value>,
 *                     percent_off: 100 }
 */

import "server-only";
import { getStripe, isStripeConfigured } from "@/lib/stripe/client";
import { logServerError } from "@/lib/server/safe-error";
import type { PricingDiscountRow } from "./pricing-types";

export type DiscountSyncResult =
  | { ok: true; couponId: string; promotionCodeId: string; stub: false }
  | { ok: true; couponId: null; promotionCodeId: null; stub: true; reason: string }
  | { ok: false; error: string };

export type DiscountArchiveResult =
  | { ok: true; stub: false }
  | { ok: true; stub: true; reason: string }
  | { ok: false; error: string };

/**
 * Create a Stripe Coupon + matching Promotion Code for a discount row.
 * Returns both IDs (or stub markers) for the caller to persist on the
 * `product_discounts` row.
 *
 * `code` is the human-typed redemption code (e.g. "LATAM50") — Stripe
 * normalizes to uppercase.
 */
export async function syncDiscountToStripe(input: {
  code: string;
  name: string;
  kind: PricingDiscountRow["kind"];
  /** For percent: 1-100. For fixed: major-unit amount (e.g. 10 = $10).
   *  For free_months: integer count of months (1-12). */
  value: number;
  /** Required when kind=fixed; ignored otherwise. ISO-4217 uppercase. */
  currency: string | null;
  maxRedemptions: number | null;
  startsAt: string | null;
  endsAt: string | null;
}): Promise<DiscountSyncResult> {
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

  try {
    // 1. Build the coupon params per kind.
    const couponParams: Parameters<typeof stripe.coupons.create>[0] = {
      name: input.name,
      ...(input.maxRedemptions != null
        ? { max_redemptions: input.maxRedemptions }
        : {}),
      ...(input.endsAt
        ? { redeem_by: Math.floor(new Date(input.endsAt).getTime() / 1000) }
        : {}),
    };
    if (input.kind === "percent") {
      couponParams.percent_off = input.value;
      couponParams.duration = "once";
    } else if (input.kind === "fixed") {
      if (!input.currency) {
        return { ok: false, error: "Fixed discounts require a currency." };
      }
      couponParams.amount_off = Math.round(input.value * 100);
      couponParams.currency = input.currency.toLowerCase();
      couponParams.duration = "once";
    } else {
      // free_months — N months of 100% off
      couponParams.percent_off = 100;
      couponParams.duration = "repeating";
      couponParams.duration_in_months = Math.max(1, Math.round(input.value));
    }

    const coupon = await stripe.coupons.create(couponParams);

    // 2. Create the redemption Promotion Code linked to the coupon.
    //    Stripe SDK 18.x wraps the coupon link in a `promotion` object
    //    (`{ coupon, type: 'coupon' }`) — older docs showing a flat
    //    `coupon` field are stale.
    const promoParams: Parameters<typeof stripe.promotionCodes.create>[0] = {
      promotion: { coupon: coupon.id, type: "coupon" },
      code: input.code.toUpperCase(),
      ...(input.maxRedemptions != null
        ? { max_redemptions: input.maxRedemptions }
        : {}),
      ...(input.endsAt
        ? { expires_at: Math.floor(new Date(input.endsAt).getTime() / 1000) }
        : {}),
    };
    if (input.startsAt) {
      // Stripe doesn't have a "starts_at" on promo codes; we honor the
      // window server-side in `validateDiscount`. No-op here — comment
      // so it doesn't look like an oversight.
    }
    const promo = await stripe.promotionCodes.create(promoParams);

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
