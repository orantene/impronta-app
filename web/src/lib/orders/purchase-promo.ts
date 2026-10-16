import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { logServerError } from "@/lib/server/safe-error";
import {
  bookingCartLines,
  orderDiscountCents,
  quoteBooking,
  redemptionPlan,
  type BookingPricedLine,
  type RedemptionPlan,
} from "@/lib/promos/booking-quote.server";
import { releaseRedemptionIds } from "@/lib/promos/redemption/order-redemptions";
import type { HoldFlow } from "@/lib/promos/redemption/policy";
import { holdPromo, type RedemptionClientStatus, type SourceChannel } from "@/lib/promos/redemption/service";
import type { PurchaseRefusalReason } from "@/lib/orders/purchase-types";

/**
 * The purchase pipeline's promo legs, out of `purchase.ts` (800-line cap).
 *
 * Two paths, never both on one order:
 *
 *   • TYPED CODE on a cart (`input.promoCode`): resolved before the order and
 *     redeemed under `redeem_tenant_promo`'s row lock after it. Unchanged,
 *     only moved here.
 *
 *   • BOOKING PROMOS (`input.bookingPromo`, Promos v1): live auto / link /
 *     typed promos priced by `quoteBooking`, then HELD against the order
 *     (`promo_hold`) BEFORE the payment row and the Stripe session exist.
 *     Confirmed when the order is paid / settles / the visit is confirmed;
 *     released when the checkout dies. A hold that fails refuses the purchase:
 *     the client was shown a discounted price and is never charged the full
 *     one by silence.
 */

// ── Typed code on a cart: redeem under the lock (moved from purchase.ts 5c) ──

export async function redeemTypedCode(
  admin: SupabaseClient,
  input: { codeId: string; orderId: string; customerId: string | null; discountCents: number },
): Promise<{ ok: true } | { ok: false; reason: PurchaseRefusalReason; why: string }> {
  const { data: redeemed, error: redeemErr } = await admin.rpc("redeem_tenant_promo", {
    p_code_id: input.codeId,
    p_order_id: input.orderId,
    p_customer_id: input.customerId,
    p_amount_cents: input.discountCents,
  });
  if (redeemErr) {
    logServerError("orders.createPurchase/redeem", redeemErr);
    return { ok: false, reason: "promo_unavailable", why: "promo redemption failed" };
  }
  const verdict = (redeemed ?? {}) as { ok?: boolean; reason?: string };
  if (verdict.ok !== true) {
    return {
      ok: false,
      // The lock saw a truth the advisory counts missed. `exhausted` is by
      // far the likeliest and is what a buyer needs told.
      reason: verdict.reason === "customer_limit_reached" ? "promo_customer_limit" : "promo_exhausted",
      why: `promo refused under lock: ${verdict.reason ?? "unknown"}`,
    };
  }
  return { ok: true };
}

/** The one talent every line belongs to, or null when lines are mixed / talent-less. */
export function soleTalent(ids: readonly (string | null)[]): string | null {
  const set = new Set(ids);
  if (set.size !== 1) return null;
  return ids[0] ?? null;
}

// ── Booking promos ─────────────────────────────────────────────────────────

export type BookingPromoRequest = {
  /** The code the client typed in the sheet, if any. Honoured or the purchase refuses. */
  code?: string | null;
  /** From the 7-day promo link cookie. */
  linkPromoIds?: readonly string[];
  /** The appointment start (ISO), for appointment-basis promos. */
  appointmentStart?: string | null;
  /** Instant checkout holds 10 min; a request waits up to 24h for the talent. */
  flow: HoldFlow;
  /** First-touch `via` cookie of the promo link, when there was one. */
  via?: SourceChannel | null;
  /**
   * The discount the sheet SHOWED (read-only preview). A smaller discount now
   * means a promo ran out between preview and confirm: refuse, so the client
   * sees the regular price before paying it.
   */
  shownDiscountCents?: number | null;
};

export type BookingPromoPrice = {
  /** What the order records as discount (includes a free booking's waived remainder). */
  discountCents: number;
  plan: RedemptionPlan[];
  clientStatus: RedemptionClientStatus;
  currency: string;
};

export type BookingPromoDeps = { quoteBooking: typeof quoteBooking; holdPromo: typeof holdPromo };
const DEPS: BookingPromoDeps = { quoteBooking, holdPromo };

/** Step 5b for a booking: price the live promos. Reads only; holds nothing. */
export async function priceBookingPromo(
  admin: SupabaseClient,
  input: {
    tenantId: string;
    /** The talent that owns the booked offering(s); null = agency-wide promos only. */
    talentProfileId: string | null;
    customerId: string | null;
    currency: string;
    lines: readonly BookingPricedLine[];
    request: BookingPromoRequest;
  },
  deps: BookingPromoDeps = DEPS,
): Promise<{ ok: true; value: BookingPromoPrice } | { ok: false; reason: PurchaseRefusalReason; error: string }> {
  const zero: BookingPromoPrice = { discountCents: 0, plan: [], clientStatus: "new", currency: input.currency };
  // A hold belongs to a buyer; without one no promo can be held, and a typed
  // code must not be dropped silently.
  if (!input.customerId) {
    if (input.request.code) {
      return { ok: false, reason: "no_contact", error: "A discount code belongs to a buyer, so this order needs an email or a phone." };
    }
    return { ok: true, value: zero };
  }
  const q = await deps.quoteBooking(admin, {
    tenantId: input.tenantId,
    talentProfileId: input.talentProfileId,
    customerId: input.customerId,
    lines: bookingCartLines(input.lines, { currency: input.currency, appointmentStart: input.request.appointmentStart ?? null }),
    code: input.request.code ?? null,
    linkPromoIds: input.request.linkPromoIds ?? [],
  });
  if (!q.ok) return { ok: false, reason: "promo_unavailable", error: "We could not check the offer. Please try again." };
  const { quote, typed, clientStatus } = q.value;
  if (typed.kind === "refused") return { ok: false, reason: typed.reason, error: "That code could not be applied." };
  const discountCents = orderDiscountCents(quote);
  if (input.request.shownDiscountCents != null && discountCents < input.request.shownDiscountCents) {
    return { ok: false, reason: "promo_exhausted", error: "This offer just ran out." };
  }
  return { ok: true, value: { discountCents, plan: redemptionPlan(quote), clientStatus, currency: quote.currency } };
}

function channelFor(source: RedemptionPlan["source"], via: SourceChannel | null | undefined): SourceChannel {
  if (source === "code") return "code";
  if (source === "link") return via ?? "link";
  return via ?? "site";
}

function holdRefusal(reason: string | undefined): PurchaseRefusalReason {
  if (reason === "customer_limit_reached" || reason === "not_reusable") return "promo_customer_limit";
  if (reason === "db_error") return "promo_unavailable";
  return "promo_exhausted";
}

/**
 * Step 5c for a booking: hold every applied promo against the order, BEFORE
 * the payment row. All or nothing: a failed hold releases the ones before it.
 * The snapshots go on the held row now so settling needs only the order id.
 *
 * A request-to-book has no order when it is sent: pass `requestId` (the
 * inquiry id) instead and the hold is anchored on `booking_id` for up to 24h
 * (see `promos/redemption/request-holds.ts`).
 */
export async function holdBookingPromos(
  admin: SupabaseClient,
  input: {
    orderId?: string | null;
    requestId?: string | null;
    customerId: string;
    price: BookingPromoPrice;
    flow: HoldFlow;
    via?: SourceChannel | null;
  },
  deps: Pick<BookingPromoDeps, "holdPromo"> = DEPS,
): Promise<{ ok: true; redemptionIds: string[] } | { ok: false; reason: PurchaseRefusalReason; why: string }> {
  if (!input.orderId && !input.requestId) {
    return { ok: false, reason: "promo_unavailable", why: "promo hold needs an order or a request" };
  }
  const held: string[] = [];
  for (const p of input.price.plan) {
    const res = await deps.holdPromo(admin, {
      promoId: p.promoId,
      customerId: input.customerId,
      flow: input.flow,
      orderId: input.orderId ?? null,
      bookingId: input.orderId ? null : input.requestId ?? null,
      discountCents: p.discountCents,
      isPricePromo: p.isPricePromo,
      source: p.source,
      clientStatus: input.price.clientStatus,
    });
    if (!res.ok || !res.redemption_id) {
      await releaseRedemptionIds(admin, held);
      return { ok: false, reason: holdRefusal(res.reason), why: `promo hold refused: ${res.reason ?? "unknown"}` };
    }
    held.push(res.redemption_id);
    const { error } = await admin
      .from("tenant_promo_redemptions")
      .update({
        list_cents: p.listCents,
        discount_cents: p.discountCents,
        currency: input.price.currency,
        source_channel: channelFor(p.source, input.via),
      })
      .eq("id", res.redemption_id)
      .eq("status", "held");
    // Snapshots are for reports; a failed write must not cost the client the promo.
    if (error) logServerError("orders.createPurchase/promoSnapshot", error);
  }
  return { ok: true, redemptionIds: held };
}
