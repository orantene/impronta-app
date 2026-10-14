import "server-only";

import { randomInt } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

import { logServerError } from "@/lib/server/safe-error";
import type { CompleteOrderResult } from "@/lib/orders/complete-order";
import type { CancelPaymentLinkFn } from "@/lib/talent-agenda/cancel-money";

import { personalCode } from "./policy";
import type { confirmRedemption, holdPromo, releaseRedemption } from "./service";

/**
 * Cortesía (design Q6): a 100% courtesy is NOT a promo the public can see. It
 * is one booking for one client, given for a reason, that charges 0 and pays
 * no fee, and shows in results as gifted value.
 *
 * It is anchored on a booking the talent already owns (booked from the agenda
 * as usual). It is refused once any money was taken or is landing: a courtesy
 * after payment is a refund, which is Money's job. Otherwise:
 *
 *   1. a one-client, single-use, 100% courtesy promo row (courtesy_reason set,
 *      leak guard off, bound to the booking's customer),
 *   2. a redemption on the booking: held then confirmed at once with
 *      list = discount = the booking's price and is_price_promo = false, which
 *      is exactly what results count as gifted (`computePromoResult`),
 *   3. the booking's unpaid order settles as a FREE SALE, the way the repo
 *      settles every zero-total order: discount = subtotal, tax / tip 0,
 *      total 0, then `completeZeroTotalOrder` (status paid, no payment row,
 *      no fee). Open pay links come down first. The order is never
 *      cancelled: a confirmed booking must not carry a cancelled order.
 *
 * Idempotent per booking: a second call answers `already`.
 */

export const COURTESY_REASONS = ["influencer", "gift", "make_good", "other"] as const;
export type CourtesyReason = (typeof COURTESY_REASONS)[number];

export function isCourtesyReason(v: unknown): v is CourtesyReason {
  return typeof v === "string" && (COURTESY_REASONS as readonly string[]).includes(v);
}

export type CourtesyError =
  | "invalid"
  | "not_found"
  | "cancelled"
  | "needs_client"
  | "already_paid"
  | "unavailable";

export type CourtesyResult =
  | { ok: true; already: boolean; promoId: string | null; redemptionId: string | null; giftedCents: number; currency: string }
  | { ok: false; error: CourtesyError };

export type CourtesyDeps = {
  holdPromo: typeof holdPromo;
  confirmRedemption: typeof confirmRedemption;
  releaseRedemption: typeof releaseRedemption;
  ledgerPaidCents: (db: SupabaseClient, orderId: string | null) => Promise<number | null>;
  paymentInFlight: (db: SupabaseClient, orderId: string | null) => Promise<boolean | null>;
  cancelPaymentLink: CancelPaymentLinkFn;
  /** The repo's free-sale writer (`completeZeroTotalOrder`): commits holds, flips to paid, no payment row. */
  completeZeroTotalOrder: (db: SupabaseClient, input: { tenantId: string; orderId: string }) => Promise<CompleteOrderResult>;
  code: () => string;
};

type BookingRow = { id: string; tenant_id: string; status: string | null; customer_id: string | null; order_id: string | null };
type OrderRow = {
  status: string | null;
  subtotal_cents: number | null;
  currency: string | null;
  version: number | null;
};

/** Orders a courtesy can turn into a free sale (what `completeZeroTotalOrder` accepts). */
const OPEN_ORDER = ["draft", "pending_payment"] as const;
const SETTLED_ORDER = ["paid", "fulfilled"] as const;

const intCents = (v: unknown): number | null => {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isInteger(n) && n > 0 ? n : null;
};

/** Pure: the courtesy promo row. 100% off, one client, single use, never public. */
export function courtesyPromoRow(input: {
  tenantId: string;
  customerId: string;
  reason: CourtesyReason;
  code: string;
  currency: string;
  createdBy: string;
  now: Date;
}): Record<string, unknown> {
  return {
    tenant_id: input.tenantId,
    code: input.code,
    name: "Cortesía",
    label: "Cortesía",
    kind: "percent",
    offer_kind: "percent",
    value: 100,
    currency: input.currency,
    scope_kind: "all",
    applies_on: "appointment",
    unlock: "code",
    audience: "one_client",
    customer_id: input.customerId,
    is_single_use: true,
    max_redemptions: 1,
    per_customer_limit: 1,
    courtesy_reason: input.reason,
    leak_guard: false,
    starts_at: input.now.toISOString(),
    // The redemption is confirmed in the same call; a short window keeps the
    // row from ever reading as a live promo afterwards.
    ends_at: new Date(input.now.getTime() + 60 * 60_000).toISOString(),
    created_by: input.createdBy,
  };
}

async function existingCourtesy(
  db: SupabaseClient,
  bookingId: string,
): Promise<{ id: string; promo_code_id: string; discount_cents: number | null; currency: string | null } | null | "error"> {
  const { data, error } = await db
    .from("tenant_promo_redemptions")
    .select("id, promo_code_id, discount_cents, currency, tenant_promo_codes!inner(courtesy_reason, parent_promo_id)")
    .eq("booking_id", bookingId)
    .eq("status", "confirmed")
    .not("tenant_promo_codes.courtesy_reason", "is", null)
    // A redeemed make-good re-issue has a parent; a Cortesía never does.
    .is("tenant_promo_codes.parent_promo_id", null)
    .limit(1);
  if (error) {
    logServerError("promos.courtesy/existing", error);
    return "error";
  }
  const rows = (data ?? []) as unknown as { id: string; promo_code_id: string; discount_cents: number | null; currency: string | null }[];
  return rows[0] ?? null;
}

export async function giveCourtesy(
  db: SupabaseClient,
  input: {
    tenantId: string;
    actorUserId: string;
    bookingId: string;
    reason: unknown;
    /** Used only when the booking has no order to read a price from. */
    listCents?: unknown;
    currency?: string | null;
    now?: Date;
  },
  deps: CourtesyDeps,
): Promise<CourtesyResult> {
  if (!isCourtesyReason(input.reason) || !input.bookingId) return { ok: false, error: "invalid" };
  const now = input.now ?? new Date();

  const { data: bookingData, error: bookingErr } = await db
    .from("agency_bookings")
    .select("id, tenant_id, status, customer_id, order_id")
    .eq("id", input.bookingId)
    .eq("tenant_id", input.tenantId)
    .maybeSingle();
  if (bookingErr) {
    logServerError("promos.courtesy/booking", bookingErr);
    return { ok: false, error: "unavailable" };
  }
  const booking = bookingData as BookingRow | null;
  if (!booking) return { ok: false, error: "not_found" };
  if (booking.status === "cancelled") return { ok: false, error: "cancelled" };
  if (!booking.customer_id) return { ok: false, error: "needs_client" };

  const prior = await existingCourtesy(db, booking.id);
  if (prior === "error") return { ok: false, error: "unavailable" };
  if (prior) {
    return {
      ok: true,
      already: true,
      promoId: prior.promo_code_id,
      redemptionId: prior.id,
      giftedCents: Number(prior.discount_cents ?? 0),
      currency: (prior.currency ?? "MXN").toUpperCase(),
    };
  }

  let order: OrderRow | null = null;
  if (booking.order_id) {
    const { data, error } = await db
      .from("orders")
      .select("status, subtotal_cents, currency, version")
      .eq("id", booking.order_id)
      .eq("tenant_id", input.tenantId)
      .maybeSingle();
    if (error) {
      logServerError("promos.courtesy/order", error);
      return { ok: false, error: "unavailable" };
    }
    order = (data as OrderRow | null) ?? null;
  }

  // Money taken or landing: a courtesy now would be a refund. Unknown counts as paid.
  const paid = await deps.ledgerPaidCents(db, booking.order_id);
  if (paid === null) return { ok: false, error: "unavailable" };
  if (paid > 0) return { ok: false, error: "already_paid" };
  const inFlight = await deps.paymentInFlight(db, booking.order_id);
  if (inFlight !== false) return inFlight === null ? { ok: false, error: "unavailable" } : { ok: false, error: "already_paid" };

  const orderStatus = order?.status ?? null;
  const settleOrder = Boolean(booking.order_id && order && (OPEN_ORDER as readonly (string | null)[]).includes(orderStatus));
  if (booking.order_id) {
    if (!order) return { ok: false, error: "unavailable" };
    // A paid / fulfilled order with nothing in the ledger already owes 0.
    if (!settleOrder && !(SETTLED_ORDER as readonly (string | null)[]).includes(orderStatus)) {
      return { ok: false, error: "unavailable" };
    }
  }

  // Open pay links come down BEFORE anything is gifted. A link whose session
  // already completed is money landing: refuse (that is a refund, not a gift).
  if (settleOrder && booking.order_id) {
    const { data: links, error: linksErr } = await db
      .from("payment_links")
      .select("id")
      .eq("tenant_id", input.tenantId)
      .eq("order_id", booking.order_id)
      .eq("status", "open");
    if (linksErr) {
      logServerError("promos.courtesy/links", linksErr);
      return { ok: false, error: "unavailable" };
    }
    for (const link of (links ?? []) as { id: string }[]) {
      const killed = await deps.cancelPaymentLink(db, { tenantId: input.tenantId, linkId: link.id });
      if (!killed.ok) return { ok: false, error: killed.reason === "already_paid" ? "already_paid" : "unavailable" };
    }
  }

  const listCents = intCents(order?.subtotal_cents) ?? intCents(input.listCents);
  if (listCents === null) return { ok: false, error: "invalid" };
  const currency = (order?.currency ?? input.currency ?? "MXN").toUpperCase();

  let promoId: string | null = null;
  for (let attempt = 0; attempt < 4 && !promoId; attempt++) {
    const { data, error } = await db
      .from("tenant_promo_codes")
      .insert(
        courtesyPromoRow({
          tenantId: input.tenantId,
          customerId: booking.customer_id,
          reason: input.reason,
          code: deps.code(),
          currency,
          createdBy: input.actorUserId,
          now,
        }),
      )
      .select("id")
      .single();
    if (!error && data) promoId = (data as { id: string }).id;
    else if (error && error.code !== "23505") {
      logServerError("promos.courtesy/promo", error);
      return { ok: false, error: "unavailable" };
    }
  }
  if (!promoId) return { ok: false, error: "unavailable" };

  const retire = async () => {
    const { error } = await db.from("tenant_promo_codes").update({ archived_at: now.toISOString() }).eq("id", promoId);
    if (error) logServerError("promos.courtesy/retire", error);
  };

  const held = await deps.holdPromo(db, {
    promoId,
    customerId: booking.customer_id,
    flow: "instant",
    orderId: null,
    bookingId: booking.id,
    discountCents: listCents,
    isPricePromo: false,
    source: "personal",
    clientStatus: null,
  });
  if (!held.ok || !held.redemption_id) {
    logServerError("promos.courtesy/hold", `booking ${booking.id}: ${held.reason ?? "unknown"}`);
    await retire();
    return { ok: false, error: "unavailable" };
  }
  // Charge 0: the order becomes a free sale before the gift is confirmed, so a
  // failure here leaves nothing gifted and nothing owed changed.
  if (settleOrder && booking.order_id && order) {
    const { data: zeroed, error: zeroErr } = await db
      .from("orders")
      .update({
        discount_cents: listCents,
        tax_cents: 0,
        tip_cents: 0,
        total_cents: 0,
        version: Number(order.version ?? 0) + 1,
      })
      .eq("id", booking.order_id)
      .eq("tenant_id", input.tenantId)
      .eq("version", Number(order.version ?? 0))
      .in("status", [...OPEN_ORDER])
      .select("id")
      .maybeSingle();
    const free = zeroErr || !zeroed ? null : await deps.completeZeroTotalOrder(db, { tenantId: input.tenantId, orderId: booking.order_id });
    if (!free || !free.ok) {
      logServerError("promos.courtesy/freeSale", zeroErr ?? `booking ${booking.id}: order could not settle as a free sale`);
      await deps.releaseRedemption(db, held.redemption_id);
      await retire();
      return { ok: false, error: "unavailable" };
    }
  }

  const confirmed = await deps.confirmRedemption(db, {
    redemptionId: held.redemption_id,
    listCents,
    discountCents: listCents,
    currency,
    sourceChannel: null,
    clientStatus: null,
  });
  if (!confirmed.ok) {
    // The order is already a free sale here: the booking is given, only the
    // results row is missing. A human re-records it; never re-charge.
    logServerError(
      "promos.courtesy/COURTESY_NOT_RECORDED",
      `booking ${booking.id}: free sale settled but redemption ${held.redemption_id} not confirmed (${confirmed.reason ?? "unknown"}). Needs a human.`,
    );
    return { ok: false, error: "unavailable" };
  }

  return { ok: true, already: false, promoId, redemptionId: held.redemption_id, giftedCents: listCents, currency };
}

export function defaultCourtesyCode(): string {
  return personalCode("CORTESIA", (n) => randomInt(n));
}
