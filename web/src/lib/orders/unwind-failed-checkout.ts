import type { SupabaseClient } from "@supabase/supabase-js";
import { logServerError } from "@/lib/server/safe-error";
import { improntaLog } from "@/lib/server/structured-log";
import { releaseCapacity } from "@/lib/capacity";
import { releaseReservationHold } from "@/lib/scheduling/reservation-hold";

/**
 * F5 (Phase 0): the purchase pipeline placed the order, its hold and its money
 * row, but the Stripe Checkout session could not be created. Nobody can pay
 * that order, so it must not sit on the talent's calendar until the hold TTL
 * lapses. Only for a DEFINITE failure (Stripe created nothing); an uncertain
 * one keeps its hold so an idempotent retry can reuse the session. This
 * undoes it in the same order `createPurchase`'s own unwind does: slot, capacity, transaction, order. Every write is guarded on the row still
 * being unpaid, so a racing settle is never cancelled.
 *
 * Not yet wired to `checkout.session.expired` for instant orders: that event
 * carries only the transaction id, and resolving the allocation ids from it
 * needs an order-lines read the webhook does not do today. Those orders are
 * still reaped by the expire-orders cron at hold TTL.
 */
export type FailedCheckoutUnwindInput = {
  orderId: string;
  transactionId: string | null;
  allocationIds: readonly string[];
  reservationHoldId: string | null;
  why: string;
};

export type FailedCheckoutUnwindDeps = {
  releaseHold: typeof releaseReservationHold;
  releaseAllocations: typeof releaseCapacity;
};

const DEFAULT_DEPS: FailedCheckoutUnwindDeps = {
  releaseHold: releaseReservationHold,
  releaseAllocations: releaseCapacity,
};

export async function unwindFailedCheckout(
  admin: SupabaseClient,
  input: FailedCheckoutUnwindInput,
  deps: FailedCheckoutUnwindDeps = DEFAULT_DEPS,
): Promise<{ ok: boolean }> {
  let ok = true;
  if (input.reservationHoldId) {
    const released = await deps.releaseHold(admin, input.reservationHoldId);
    if (!released.ok) {
      ok = false;
      logServerError("orders.unwindFailedCheckout/slot", `${input.why}: ${released.error}`);
    }
  }
  if (input.allocationIds.length > 0) {
    const released = await deps.releaseAllocations(input.allocationIds, admin);
    if (!released.ok) ok = false;
  }
  if (input.transactionId) {
    const { error } = await admin
      .from("booking_transactions")
      .update({ status: "failed", failed_at: new Date().toISOString(), failure_reason: input.why })
      .eq("id", input.transactionId)
      .in("status", ["draft", "pending", "payment_requested"]);
    if (error) {
      ok = false;
      logServerError("orders.unwindFailedCheckout/txn", error);
    }
  }
  const { error } = await admin
    .from("orders")
    .update({ status: "cancelled", hold_expires_at: null })
    .eq("id", input.orderId)
    .in("status", ["draft", "pending_payment"]);
  if (error) {
    ok = false;
    logServerError("orders.unwindFailedCheckout/order", error);
  }
  // Auditable: nothing is deleted. The order stays `cancelled`, the transaction
  // `failed` with `failure_reason`, and this event names why.
  void improntaLog("orders.checkout_unwound", {
    orderId: input.orderId,
    transactionId: input.transactionId ?? "",
    why: input.why,
    ok,
  });
  return { ok };
}
