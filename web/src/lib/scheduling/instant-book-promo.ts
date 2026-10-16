/**
 * Promos v1 on the instant-book path: the action's promo decisions, pure, so
 * the ordering rules are tested without a server action.
 *
 *   payload + cookies  -> bookingPromoRequest   (what the pipeline prices / holds)
 *   pipeline refusal   -> promoRefusal          (typed error, BEFORE any payment)
 *   pipeline success   -> instantPaymentStep    (Stripe only when money is owed)
 */

import type { BookingPromoRequest } from "@/lib/orders/purchase-promo";
import type { HoldFlow } from "@/lib/promos/redemption/policy";
import type { SourceChannel } from "@/lib/promos/redemption/service";
import { publicPromoCopy } from "@/lib/promos/copy/public";
import { normalizeTypedCode, promoCodeMessage } from "@/lib/promos/public-view";
import type { PromoRefusal } from "@/lib/orders/promo-resolve";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CHANNELS: readonly SourceChannel[] = ["ig_story", "ig_post", "tiktok", "wa", "qr", "qr_print", "link", "email", "code", "site"];

export function bookingPromoRequest(input: {
  promoCode?: string | null;
  promoShownDiscountCents?: number | null;
  /** `tl_promo` cookie: the promo id a link unlocked (7 days). */
  linkCookie?: string | null;
  /** `tl_promo_via` cookie: first-touch channel of that link. */
  viaCookie?: string | null;
  flow?: HoldFlow;
}): BookingPromoRequest {
  const code = input.promoCode ? normalizeTypedCode(input.promoCode) : "";
  const shown = input.promoShownDiscountCents;
  return {
    code: code || null,
    linkPromoIds: input.linkCookie && UUID.test(input.linkCookie) ? [input.linkCookie] : [],
    flow: input.flow ?? "instant",
    via: input.viaCookie && (CHANNELS as readonly string[]).includes(input.viaCookie) ? (input.viaCookie as SourceChannel) : null,
    shownDiscountCents: typeof shown === "number" && Number.isInteger(shown) && shown > 0 ? shown : null,
  };
}

const GONE: ReadonlySet<string> = new Set(["promo_exhausted", "promo_customer_limit", "promo_expired"]);
const CODE_REFUSALS: ReadonlySet<string> = new Set([
  "promo_unknown", "promo_not_started", "promo_not_applicable", "promo_unavailable",
]);

/**
 * A promo refusal from the pipeline, as the sheet needs it. Null when the
 * reason is not a promo's. The pipeline refuses BEFORE the payment row and the
 * Stripe session, so "gone" always means nothing was charged.
 */
export function promoRefusal(
  reason: string,
  ctx: { locale: string; code: string | null },
): { reason: "promo_gone" | "promo_refused"; error: string } | null {
  if (GONE.has(reason)) return { reason: "promo_gone", error: publicPromoCopy(ctx.locale).promoGone };
  if (CODE_REFUSALS.has(reason)) {
    return {
      reason: "promo_refused",
      error: promoCodeMessage({ ok: false, reason: reason as PromoRefusal | "promo_unavailable" }, ctx.code ?? "", ctx.locale),
    };
  }
  return null;
}

/** Stripe is opened only when the pipeline left money to collect (a free booking leaves none). */
export function instantPaymentStep(booked: {
  collectCents: number;
  transactionId: string | null;
  bookingId: string | null;
}): "checkout" | "no_charge" {
  return booked.collectCents > 0 && booked.transactionId && booked.bookingId ? "checkout" : "no_charge";
}
