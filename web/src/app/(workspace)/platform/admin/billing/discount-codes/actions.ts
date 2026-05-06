"use server";

/**
 * Platform-admin discount-code surface (server actions).
 *
 * Lets the founder mint Stripe Coupons + Promotion Codes from inside the
 * app. Internal use cases:
 *   - 100% off "FRIENDS_FREE" codes for friends/family/internal QA.
 *   - Time-limited launch promotions ("EARLY30" → 30% off for 3 months).
 *   - Founder-issued comp grants for specific tenants.
 *
 * Anyone with the `manage_discount_codes` capability (super_admin only by
 * default) can mint, list, and disable codes. The codes are stored in
 * Stripe — there's no app-side schema for them. Stripe is the source of
 * truth.
 *
 * Once minted, a code is enterable in any of our existing Stripe Checkout
 * flows because every checkout session is created with
 * `allow_promotion_codes: true`.
 */

import { isStripeConfigured, getStripe } from "@/lib/stripe/client";
import { getCachedActorSession } from "@/lib/server/request-cache";
import { getPlatformRole } from "@/lib/access/platform-role";
import { logServerError } from "@/lib/server/safe-error";

export type DiscountCodeSummary = {
  promotionCodeId: string;
  code: string;
  active: boolean;
  percentOff: number | null;
  amountOffCents: number | null;
  currency: string | null;
  duration: "once" | "repeating" | "forever";
  durationInMonths: number | null;
  maxRedemptions: number | null;
  timesRedeemed: number;
  expiresAt: string | null;
  createdAt: string;
  // Surface the enabled coupon's metadata so the UI can show internal
  // notes (e.g. who minted it, what it's for).
  metadata: Record<string, string>;
};

export type DiscountCodeActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: string };

// ─── Authorization helper ─────────────────────────────────────────────────────

async function requirePlatformAdmin() {
  const session = await getCachedActorSession();
  if (!session.user) return { ok: false as const, error: "Not authenticated." };
  const role = getPlatformRole(session.profile);
  if (role !== "super_admin") return { ok: false as const, error: "Forbidden." };
  return { ok: true as const, userId: session.user.id };
}

// ─── Create ───────────────────────────────────────────────────────────────────

export type CreateDiscountCodeArgs = {
  /** Customer-facing code, e.g. "FRIENDS_FREE" or "EARLY30". */
  code: string;
  /** 0–100. Mutually exclusive with amountOffCents. */
  percentOff?: number;
  /** Cents. Use either this OR percentOff. */
  amountOffCents?: number;
  /** ISO 4217 currency code, required when amountOffCents is set. */
  currency?: string;
  /**
   * once     — applies to the first invoice only.
   * forever  — applies to every renewal until cancelled.
   * repeating— applies for `durationInMonths` months.
   */
  duration: "once" | "forever" | "repeating";
  durationInMonths?: number;
  /** Cap on global redemptions across all customers. */
  maxRedemptions?: number;
  /** Date string the code stops accepting new redemptions. */
  expiresAt?: string;
  /** Internal note for audit (e.g. "for impronta launch"). */
  internalNote?: string;
};

export async function createPlatformDiscountCode(
  args: CreateDiscountCodeArgs,
): Promise<DiscountCodeActionResult<DiscountCodeSummary>> {
  if (!isStripeConfigured()) return { ok: false, error: "Stripe is not configured." };

  const auth = await requirePlatformAdmin();
  if (!auth.ok) return auth;

  if ((args.percentOff == null) === (args.amountOffCents == null)) {
    return { ok: false, error: "Provide exactly one of percentOff or amountOffCents." };
  }
  if (args.percentOff != null && (args.percentOff <= 0 || args.percentOff > 100)) {
    return { ok: false, error: "percentOff must be between 1 and 100." };
  }
  if (args.amountOffCents != null && (!args.currency || args.amountOffCents <= 0)) {
    return { ok: false, error: "amountOffCents requires a positive amount and a currency." };
  }
  if (args.duration === "repeating" && (!args.durationInMonths || args.durationInMonths <= 0)) {
    return { ok: false, error: "durationInMonths is required when duration is 'repeating'." };
  }

  const stripe = getStripe()!;

  try {
    const couponParams: Record<string, unknown> = {
      duration: args.duration,
      metadata: {
        created_by_user_id: auth.userId,
        customer_facing_code: args.code,
        ...(args.internalNote ? { internal_note: args.internalNote } : {}),
      },
    };
    if (args.percentOff != null) {
      couponParams.percent_off = args.percentOff;
    } else {
      couponParams.amount_off = args.amountOffCents!;
      couponParams.currency = args.currency!;
    }
    if (args.duration === "repeating") {
      couponParams.duration_in_months = args.durationInMonths!;
    }
    if (args.maxRedemptions) {
      couponParams.max_redemptions = args.maxRedemptions;
    }

    const coupon = await stripe.coupons.create(couponParams as unknown as Parameters<typeof stripe.coupons.create>[0]);

    const promoParams: Record<string, unknown> = {
      coupon: coupon.id,
      code: args.code,
      metadata: {
        created_by_user_id: auth.userId,
        ...(args.internalNote ? { internal_note: args.internalNote } : {}),
      },
    };
    if (args.maxRedemptions) {
      promoParams.max_redemptions = args.maxRedemptions;
    }
    if (args.expiresAt) {
      promoParams.expires_at = Math.floor(new Date(args.expiresAt).getTime() / 1000);
    }

    const promo = await stripe.promotionCodes.create(
      promoParams as unknown as Parameters<typeof stripe.promotionCodes.create>[0],
    );

    return {
      ok: true,
      data: shapePromotionCode(promoToShape(promo), couponToShape(coupon as Stripe.Coupon)),
    };
  } catch (err) {
    logServerError("platform-discount-codes.create", err);
    const message = err instanceof Error ? err.message : "Failed to create discount code.";
    return { ok: false, error: message };
  }
}

// ─── List ─────────────────────────────────────────────────────────────────────

export async function listPlatformDiscountCodes(): Promise<DiscountCodeActionResult<DiscountCodeSummary[]>> {
  if (!isStripeConfigured()) return { ok: false, error: "Stripe is not configured." };

  const auth = await requirePlatformAdmin();
  if (!auth.ok) return auth;

  const stripe = getStripe()!;

  try {
    const list = await stripe.promotionCodes.list({ limit: 100, expand: ["data.coupon"] });
    const summaries: DiscountCodeSummary[] = list.data.map((promo) => {
      // `coupon` is always expanded because we requested it; the type system
      // sees it as `string` because Stripe's SDK doesn't narrow on expand.
      const expandedCoupon = (promo as unknown as { coupon: string | Stripe.Coupon }).coupon;
      return shapePromotionCode(promoToShape(promo), couponToShape(expandedCoupon));
    });
    return { ok: true, data: summaries };
  } catch (err) {
    logServerError("platform-discount-codes.list", err);
    return { ok: false, error: "Failed to list discount codes." };
  }
}

// ─── Disable ──────────────────────────────────────────────────────────────────

export async function disablePlatformDiscountCode(
  promotionCodeId: string,
): Promise<DiscountCodeActionResult> {
  if (!isStripeConfigured()) return { ok: false, error: "Stripe is not configured." };

  const auth = await requirePlatformAdmin();
  if (!auth.ok) return auth;

  const stripe = getStripe()!;

  try {
    await stripe.promotionCodes.update(promotionCodeId, { active: false });
    return { ok: true, data: undefined };
  } catch (err) {
    logServerError("platform-discount-codes.disable", err);
    return { ok: false, error: "Failed to disable discount code." };
  }
}

// ─── Mappers ──────────────────────────────────────────────────────────────────

import type Stripe from "stripe";

function promoToShape(promo: Stripe.PromotionCode): {
  id: string;
  code: string;
  active: boolean;
  times_redeemed: number;
  max_redemptions: number | null;
  expires_at: number | null;
  created: number;
  metadata: Record<string, string>;
} {
  return {
    id:              promo.id,
    code:            promo.code,
    active:          promo.active,
    times_redeemed:  promo.times_redeemed ?? 0,
    max_redemptions: promo.max_redemptions ?? null,
    expires_at:      promo.expires_at ?? null,
    created:         promo.created,
    metadata:        (promo.metadata ?? {}) as Record<string, string>,
  };
}

function couponToShape(
  coupon: string | Stripe.Coupon,
): {
  percent_off?: number | null;
  amount_off?: number | null;
  currency?: string | null;
  duration: "once" | "repeating" | "forever";
  duration_in_months?: number | null;
  metadata?: Record<string, string>;
} {
  if (typeof coupon === "string") {
    // shouldn't happen with expand:'coupon', but guard anyway
    return { duration: "once" };
  }
  return {
    percent_off:        coupon.percent_off ?? null,
    amount_off:         coupon.amount_off ?? null,
    currency:           coupon.currency ?? null,
    duration:           coupon.duration,
    duration_in_months: coupon.duration_in_months ?? null,
    metadata:           (coupon.metadata ?? {}) as Record<string, string>,
  };
}

function shapePromotionCode(
  promo: {
    id: string;
    code: string;
    active: boolean;
    times_redeemed: number;
    max_redemptions: number | null;
    expires_at: number | null;
    created: number;
    metadata: Record<string, string>;
  },
  coupon: {
    percent_off?: number | null;
    amount_off?: number | null;
    currency?: string | null;
    duration: "once" | "repeating" | "forever";
    duration_in_months?: number | null;
    metadata?: Record<string, string>;
  },
): DiscountCodeSummary {
  return {
    promotionCodeId:  promo.id,
    code:             promo.code,
    active:           promo.active,
    percentOff:       coupon.percent_off ?? null,
    amountOffCents:   coupon.amount_off ?? null,
    currency:         coupon.currency ?? null,
    duration:         coupon.duration,
    durationInMonths: coupon.duration_in_months ?? null,
    maxRedemptions:   promo.max_redemptions ?? null,
    timesRedeemed:    promo.times_redeemed,
    expiresAt:        promo.expires_at ? new Date(promo.expires_at * 1000).toISOString() : null,
    createdAt:        new Date(promo.created * 1000).toISOString(),
    metadata:         { ...(coupon.metadata ?? {}), ...promo.metadata },
  };
}
