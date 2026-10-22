/**
 * promo-preview.ts (TUL-833) · pure pricing preview for a subscription promo
 * code. No IO, no "server-only", so the maths and the error copy are testable
 * and the UI can import the message table.
 *
 * This is for Tulala SUBSCRIPTION discounts (Stripe coupons / promotion codes
 * on Checkout). It is NOT the talent-facing "Promos engine" (TUL-934).
 *
 * The preview is informational. The real discount is applied by Stripe at
 * Checkout from the coupon; if the two ever disagree, Stripe wins.
 */
import type { PricingDiscountRow } from "@/lib/pricing/pricing-types";

export type PromoErrorCode =
  | "invalid"
  | "expired"
  | "not_applicable"
  /** TUL-833: the plan already carries a discount, which a second code would replace. */
  | "already_discounted"
  /** TUL-833: first-purchase-only code on an account that has paid before. */
  | "first_time_only"
  /** TUL-833: a code applies when the plan changes now, not at a scheduled period end. */
  | "upgrade_now_only"
  /** TUL-833: this person already used the code as many times as allowed. */
  | "limit_reached";

export const PROMO_ERROR_MESSAGES: Record<PromoErrorCode, { en: string; es: string }> = {
  invalid: {
    en: "That code isn't valid. Check it and try again.",
    es: "Ese código no es válido. Revísalo e inténtalo de nuevo.",
  },
  expired: {
    en: "That code has expired or is no longer available.",
    es: "Ese código venció o ya no está disponible.",
  },
  not_applicable: {
    en: "That code doesn't apply to this plan.",
    es: "Ese código no aplica a este plan.",
  },
  already_discounted: {
    en: "Your plan already has a discount, so another code can't be added.",
    es: "Tu plan ya tiene un descuento, así que no se puede añadir otro código.",
  },
  first_time_only: {
    en: "That code is only for a first purchase.",
    es: "Ese código es solo para una primera compra.",
  },
  upgrade_now_only: {
    en: "A code applies when you change plan now, not on a scheduled change.",
    es: "Un código aplica cuando cambias de plan ahora, no en un cambio programado.",
  },
  limit_reached: {
    en: "You already used that code the maximum number of times.",
    es: "Ya usaste ese código el máximo de veces.",
  },
};

/** Maps `validateDiscount`'s reason text to the code the UI localizes. */
export function promoErrorFromReason(reason: string): PromoErrorCode {
  return /expired|no longer|started|limit/i.test(reason) ? "expired" : "invalid";
}

export type PromoPreview = {
  code: string;
  /** Price before the code, in cents (USD catalog). */
  baseCents: number;
  /** Price during the discounted period, in cents (never below 0). */
  discountedCents: number;
  /** Months the discount lasts, or null for "forever" / once. */
  months: number | null;
  duration: PricingDiscountRow["duration"];
  kind: PricingDiscountRow["kind"];
  /** Short label such as "20% off for 3 months". */
  label: { en: string; es: string };
};

function durationText(
  duration: PricingDiscountRow["duration"],
  months: number | null,
): { en: string; es: string } {
  if (duration === "forever") return { en: "", es: "" };
  if (duration === "repeating" && months && months > 0) {
    return {
      en: ` for ${months} month${months === 1 ? "" : "s"}`,
      es: ` por ${months} ${months === 1 ? "mes" : "meses"}`,
    };
  }
  return { en: " on the first payment", es: " en el primer pago" };
}

/** `appliesTo` is "all" or the list of product_tiers ids the operator checked. */
export function discountAppliesToTier(
  appliesTo: PricingDiscountRow["appliesTo"],
  tierId: string | null,
): boolean {
  if (appliesTo === "all") return true;
  if (!tierId) return false;
  return appliesTo.includes(tierId);
}

export function computePromoPreview(
  discount: PricingDiscountRow,
  baseCents: number,
): PromoPreview {
  let discountedCents = baseCents;
  let duration = discount.duration;
  let months = discount.durationMonths;
  let off: { en: string; es: string };

  if (discount.kind === "percent") {
    discountedCents = Math.round(baseCents * (1 - discount.value / 100));
    off = { en: `${discount.value}% off`, es: `${discount.value}% de descuento` };
  } else if (discount.kind === "fixed") {
    discountedCents = baseCents - Math.round(discount.value * 100);
    off = { en: `$${discount.value} off`, es: `$${discount.value} de descuento` };
  } else {
    // free_months: 100% off, repeating for N months (mirrors the Stripe sync).
    discountedCents = 0;
    duration = "repeating";
    months = Math.round(discount.value);
    off = { en: "Free", es: "Gratis" };
  }
  discountedCents = Math.max(0, discountedCents);

  const dur = durationText(duration, months);
  return {
    code: discount.code,
    baseCents,
    discountedCents,
    months: duration === "repeating" ? months : null,
    duration,
    kind: discount.kind,
    label: { en: `${off.en}${dur.en}`, es: `${off.es}${dur.es}` },
  };
}
