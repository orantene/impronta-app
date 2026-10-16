import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { holdBookingPromos, type BookingPromoPrice } from "@/lib/orders/purchase-promo";
import type { PurchaseRefusalReason } from "@/lib/orders/purchase-types";

import {
  confirmOrderPromos,
  releaseOrderPromoHolds,
  type ConfirmOutcome,
  type OrderRedemptionDeps,
} from "./order-redemptions";
import { holdPromo, type SourceChannel } from "./service";

/**
 * Request-to-book promo holds (Promos v1, design B2 + L1).
 *
 *   request sent      -> holdRequestPromos     (held, expires in 24h)
 *   talent accepts    -> confirmRequestPromos  (held -> confirmed)
 *   talent declines,
 *   request cancelled,
 *   archived, expired -> releaseRequestPromos  (held -> released)
 *   24h, no answer    -> the hold lapses on its own: the SQL count ignores an
 *                        expired hold and `promo_sweep_expired_holds` marks it.
 *
 * A request has no order when it is sent, so the hold is anchored on the
 * request (inquiry) id in `booking_id`. All three calls are idempotent and
 * never throw: they act on `held` rows only.
 */

/** Engine event -> what it does to the request's held promos. Pure. */
export function requestPromoEffect(eventType: string): "confirm" | "release" | null {
  switch (eventType) {
    case "booking.created":
    case "reservation.confirmed":
      return "confirm";
    case "reservation.declined":
    case "inquiry.cancelled":
    case "inquiry.archived":
    case "inquiry.expired":
      return "release";
    default:
      return null;
  }
}

/**
 * The inquiry-engine listener body. Throws only on a failed settle, so the
 * engine's retry row replays it (every call here is idempotent).
 */
export async function settleRequestPromosForEvent(
  db: SupabaseClient,
  event: { type: string; inquiryId: string },
  deps?: OrderRedemptionDeps,
): Promise<void> {
  const effect = requestPromoEffect(event.type);
  if (!effect) return;
  const res =
    effect === "confirm"
      ? await confirmRequestPromos(db, event.inquiryId, deps)
      : await releaseRequestPromos(db, event.inquiryId, deps);
  // A lapsed seat after accept is logged for a human inside confirm; it is not retryable.
  if (!res.ok && !("lost" in res && res.lost.length > 0)) {
    throw new Error(`request promos ${effect} failed for inquiry ${event.inquiryId}`);
  }
}

export type RequestHoldDeps = { holdPromo: typeof holdPromo };
const DEPS: RequestHoldDeps = { holdPromo };

export async function holdRequestPromos(
  db: SupabaseClient,
  input: { requestId: string; customerId: string; price: BookingPromoPrice; via?: SourceChannel | null },
  deps: RequestHoldDeps = DEPS,
): Promise<{ ok: true; redemptionIds: string[] } | { ok: false; reason: PurchaseRefusalReason; why: string }> {
  if (input.price.plan.length === 0) return { ok: true, redemptionIds: [] };
  return holdBookingPromos(
    db,
    {
      requestId: input.requestId,
      customerId: input.customerId,
      price: input.price,
      flow: "request_to_book",
      via: input.via ?? null,
    },
    deps,
  );
}

export function confirmRequestPromos(
  db: SupabaseClient,
  requestId: string,
  deps?: OrderRedemptionDeps,
): Promise<ConfirmOutcome> {
  return confirmOrderPromos(db, { requestId }, deps);
}

export function releaseRequestPromos(
  db: SupabaseClient,
  requestId: string,
  deps?: Pick<OrderRedemptionDeps, "release">,
): Promise<{ ok: boolean; released: number }> {
  return releaseOrderPromoHolds(db, { requestId }, deps);
}
