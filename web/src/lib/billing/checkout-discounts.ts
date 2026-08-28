/**
 * checkout-discounts.ts — what discount, if any, a Checkout Session carries.
 *
 * WHY THIS EXISTS: checkout used to say `allow_promotion_codes: true` and stop
 * there. That meant (a) an account we had already granted 30% off paid full
 * price the moment they self-served, and (b) a buyer who arrived on
 * `?promo=LAUNCH50` had to re-type the code into Stripe's box — the URL param
 * was decoration.
 *
 * PRECEDENCE, highest first:
 *   1. an ACTIVE `subscription_discounts` row with a real coupon — the deal we
 *      negotiated with this account beats anything they typed;
 *   2. a promo code, RE-VALIDATED server-side (never trust the URL param — it
 *      arrives from the browser and is a string an attacker controls);
 *   3. nothing pre-resolved → let Stripe take a typed code.
 *
 * THE INVARIANT: Stripe rejects a Session that sets both `discounts` and
 * `allow_promotion_codes`. That is encoded in the RETURN TYPE — the two
 * branches of `CheckoutDiscountParams` mark the other field `never`, so a
 * caller that spreads `...resolved.params` cannot produce the illegal pair, and
 * a future edit that tries to set both fails to compile. `checkout-discounts.test.ts`
 * asserts the same thing at runtime for every branch.
 */

import "server-only";
import {
  loadActiveAccountDiscount,
  type AccountDiscountSubjectType,
} from "@/lib/billing/subscription-discounts";

// ─── Types ────────────────────────────────────────────────────────────────────

/** One entry of Stripe's `discounts` array — a coupon XOR a promotion code. */
export type CheckoutDiscountEntry =
  | { coupon: string; promotion_code?: never }
  | { promotion_code: string; coupon?: never };

/**
 * Spread this straight into `stripe.checkout.sessions.create(...)`. The `never`
 * markers are the mutual-exclusion guarantee — see the header.
 */
export type CheckoutDiscountParams =
  | { discounts: CheckoutDiscountEntry[]; allow_promotion_codes?: never }
  | { allow_promotion_codes: true; discounts?: never };

export type AppliedCheckoutDiscount =
  | { source: "account"; discountId: string | null; couponId: string }
  | { source: "code"; code: string; couponId: string | null; promotionCodeId: string | null };

export type ResolvedCheckoutDiscount = {
  params: CheckoutDiscountParams;
  /** What was pre-applied, for logging / metadata. Null = buyer may type one. */
  applied: AppliedCheckoutDiscount | null;
};

/** The only way to build the "let Stripe take a typed code" branch. */
export const OPEN_TO_PROMOTION_CODES: ResolvedCheckoutDiscount = {
  params: { allow_promotion_codes: true },
  applied: null,
};

// ─── Pure: precedence + exclusivity ──────────────────────────────────────────

export type CheckoutDiscountCandidates = {
  /** Coupon on the account's active `subscription_discounts` row. */
  accountCouponId?: string | null;
  accountDiscountId?: string | null;
  /** A promo code that PASSED server-side validation, with its Stripe ids. */
  promo?: {
    code: string;
    couponId: string | null;
    promotionCodeId: string | null;
  } | null;
};

/**
 * PURE precedence resolver — the whole decision, with no IO, so the matrix is
 * testable without Stripe or a database.
 */
export function buildCheckoutDiscountParams(
  candidates: CheckoutDiscountCandidates,
): ResolvedCheckoutDiscount {
  const accountCoupon = candidates.accountCouponId?.trim();
  if (accountCoupon) {
    return {
      params: { discounts: [{ coupon: accountCoupon }] },
      applied: {
        source: "account",
        discountId: candidates.accountDiscountId ?? null,
        couponId: accountCoupon,
      },
    };
  }

  const promo = candidates.promo;
  if (promo) {
    // Prefer the promotion code: it is the object Stripe counts redemptions
    // against. A code whose Stripe ids are both missing is a stub row — it
    // exists in our DB but not in Stripe, so it cannot discount anything and we
    // fall through to letting the buyer type a code instead.
    const promotionCodeId = promo.promotionCodeId?.trim();
    if (promotionCodeId) {
      return {
        params: { discounts: [{ promotion_code: promotionCodeId }] },
        applied: {
          source: "code",
          code: promo.code,
          couponId: promo.couponId,
          promotionCodeId,
        },
      };
    }
    const couponId = promo.couponId?.trim();
    if (couponId) {
      return {
        params: { discounts: [{ coupon: couponId }] },
        applied: {
          source: "code",
          code: promo.code,
          couponId,
          promotionCodeId: null,
        },
      };
    }
  }

  return OPEN_TO_PROMOTION_CODES;
}

// ─── Resolver (IO) ───────────────────────────────────────────────────────────

export type ResolveCheckoutDiscountInput = {
  subjectType: AccountDiscountSubjectType;
  tenantId?: string | null;
  talentProfileId?: string | null;
  /** Raw, browser-supplied. Re-validated here; never trusted as given. */
  promoCode?: string | null;
};

export async function resolveCheckoutDiscount(
  input: ResolveCheckoutDiscountInput,
): Promise<ResolvedCheckoutDiscount> {
  const account = await loadActiveAccountDiscount({
    subjectType: input.subjectType,
    tenantId: input.tenantId ?? null,
    talentProfileId: input.talentProfileId ?? null,
  });
  if (account?.stripeCouponId) {
    return buildCheckoutDiscountParams({
      accountCouponId: account.stripeCouponId,
      accountDiscountId: account.id,
    });
  }

  const code = input.promoCode?.trim();
  if (!code) return OPEN_TO_PROMOTION_CODES;

  // Lazy import: the validator lives in a "use server" module with the whole
  // admin-discount graph behind it, and the common checkout carries no code.
  const { validateDiscount } = await import(
    "@/lib/server-actions/admin-product-discounts"
  );
  const validated = await validateDiscount(code);
  if (!validated.ok) return OPEN_TO_PROMOTION_CODES;

  return buildCheckoutDiscountParams({
    promo: {
      code: validated.discount.code,
      couponId: validated.discount.stripeCouponId,
      promotionCodeId: validated.discount.stripePromotionCodeId,
    },
  });
}
