/**
 * plan-change-promo.ts (TUL-833) · decides whether a promo code can ride on an
 * in-app plan change, and which Stripe discount entry carries it.
 *
 * Pure orchestration over injected readers, so the whole rule table is tested
 * without Stripe or a database. The real readers live in plan-change.server.ts.
 *
 * THE RULE: only a code that exists in OUR catalog (`product_discounts`, minted
 * in Platform Admin > Discounts, which syncs a coupon + promotion code to
 * Stripe) can be applied. A code created straight in Stripe is unknown to the
 * catalog and is refused here exactly as `validatePromoCode` refuses it on the
 * upgrade modal; there is deliberately no "ask Stripe" fallback, because it
 * would skip the family / tier / first-time / per-customer / redemption-ledger
 * checks the catalog enforces. Import such a code in Platform Admin instead
 * (admin-discount-stripe-import.ts).
 */
import { discountAppliesToSubject, withinPerCustomerLimit } from "./checkout-discounts";
import { discountAppliesToTier, promoErrorFromReason, type PromoErrorCode } from "./promo-preview";
import type { PlanChangePromoInput } from "./plan-change";
import type { PricingDiscountRow } from "@/lib/pricing/pricing-types";

export type PlanChangePromoReaders = {
  validate(code: string): Promise<{ ok: true; discount: PricingDiscountRow } | { ok: false; reason: string }>;
  /** `product_tiers.id` for the target plan, or null when the plan has no catalog tier. */
  targetTierId(): Promise<string | null>;
  /** How many times this subject already redeemed this discount. */
  priorRedemptions(discountId: string): Promise<number>;
};

export type PlanChangePromoResult =
  | { ok: true; promo: PlanChangePromoInput }
  | { ok: false; promoError: PromoErrorCode };

export async function resolvePlanChangePromoWith(
  readers: PlanChangePromoReaders,
  kind: "talent" | "workspace",
  rawCode: string,
): Promise<PlanChangePromoResult> {
  const code = rawCode.trim();
  if (!code) return { ok: false, promoError: "invalid" };

  const validated = await readers.validate(code);
  if (!validated.ok) return { ok: false, promoError: promoErrorFromReason(validated.reason) };
  const d = validated.discount;

  if (!discountAppliesToSubject(d.appliesFamily, kind)) return { ok: false, promoError: "not_applicable" };
  const tierId = await readers.targetTierId();
  if (!tierId || !discountAppliesToTier(d.appliesTo, tierId)) return { ok: false, promoError: "not_applicable" };
  // An account changing plan has, by definition, paid before: Stripe would refuse a first-purchase-only code.
  if (d.firstTimeOnly) return { ok: false, promoError: "first_time_only" };
  if (!withinPerCustomerLimit(await readers.priorRedemptions(d.id), d.perCustomerLimit)) {
    return { ok: false, promoError: "limit_reached" };
  }

  // Prefer the promotion code (Stripe counts redemptions against it); a row with neither id is a stub that
  // exists in our table but not in Stripe, so it cannot discount anything.
  const promotionCodeId = d.stripePromotionCodeId?.trim();
  if (promotionCodeId) return { ok: true, promo: { entry: { promotion_code: promotionCodeId }, discount: d } };
  const couponId = d.stripeCouponId?.trim();
  if (couponId) return { ok: true, promo: { entry: { coupon: couponId }, discount: d } };
  return { ok: false, promoError: "not_applicable" };
}
