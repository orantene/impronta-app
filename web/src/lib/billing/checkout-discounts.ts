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
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError } from "@/lib/server/safe-error";

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

// ─── Pure: the two limits Stripe cannot enforce for us ───────────────────────

/**
 * `applies_family` is the coarse side filter: a workspace code must not apply
 * to a talent subscription and vice versa. Stripe's `applies_to.products` is
 * the precise, per-tier version of the same idea and Stripe enforces it; this
 * one is ours because "family" is a Tulala concept, not a Stripe one.
 *
 * NULL means both sides, which is the historical behaviour of every existing
 * row and therefore the only safe reading of an unset column.
 */
export function discountAppliesToSubject(
  appliesFamily: "workspace" | "talent" | null | undefined,
  subjectType: AccountDiscountSubjectType,
): boolean {
  return !appliesFamily || appliesFamily === subjectType;
}

/**
 * `per_customer_limit` was a column nothing ever read: the redemption ledger it
 * needed did not exist, so "one per customer" was a promise the product made
 * and never kept. `discount_redemptions` now records one row per redemption, so
 * the count is answerable.
 */
export function withinPerCustomerLimit(
  priorRedemptions: number,
  perCustomerLimit: number | null | undefined,
): boolean {
  if (perCustomerLimit == null || perCustomerLimit <= 0) return true;
  return priorRedemptions < perCustomerLimit;
}

/** How many times this subject has already redeemed this discount. */
async function countSubjectRedemptions(input: {
  discountId: string;
  subjectType: AccountDiscountSubjectType;
  tenantId: string | null;
  talentProfileId: string | null;
}): Promise<number> {
  const subjectId =
    input.subjectType === "workspace" ? input.tenantId : input.talentProfileId;
  // No subject id yet (a brand-new workspace that has not been created) means
  // there is nothing to have redeemed before. Zero, not "unknown".
  if (!subjectId) return 0;

  const admin = createServiceRoleClient();
  if (!admin) return 0;

  const column =
    input.subjectType === "workspace" ? "tenant_id" : "talent_profile_id";
  const { count, error } = await admin
    .from("discount_redemptions")
    .select("id", { count: "exact", head: true })
    .eq("discount_id", input.discountId)
    .eq(column, subjectId);
  if (error) {
    // Fail OPEN on a read error: refusing a legitimate discount because a
    // count query blipped is a worse outcome than one extra redemption, and
    // `max_redemptions` still caps the total at Stripe.
    logServerError("checkout-discounts.countSubjectRedemptions", error);
    return 0;
  }
  return count ?? 0;
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

  // `validateDiscount` answers "is this code live" — window, active flag, total
  // redemption cap. The two SUBJECT-dependent limits can only be checked here,
  // where we know who is buying.
  if (
    !discountAppliesToSubject(validated.discount.appliesFamily, input.subjectType)
  ) {
    return OPEN_TO_PROMOTION_CODES;
  }
  const priorRedemptions = await countSubjectRedemptions({
    discountId: validated.discount.id,
    subjectType: input.subjectType,
    tenantId: input.tenantId ?? null,
    talentProfileId: input.talentProfileId ?? null,
  });
  if (
    !withinPerCustomerLimit(
      priorRedemptions,
      validated.discount.perCustomerLimit,
    )
  ) {
    return OPEN_TO_PROMOTION_CODES;
  }

  return buildCheckoutDiscountParams({
    promo: {
      code: validated.discount.code,
      couponId: validated.discount.stripeCouponId,
      promotionCodeId: validated.discount.stripePromotionCodeId,
    },
  });
}
