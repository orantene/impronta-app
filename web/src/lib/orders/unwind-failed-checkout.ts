import type { SupabaseClient } from "@supabase/supabase-js";
import { logServerError } from "@/lib/server/safe-error";
import { improntaLog } from "@/lib/server/structured-log";
import { cancelUnpaidBookings } from "@/lib/bookings/cancel-unpaid-booking";
import { releaseCapacity } from "@/lib/capacity";
import { releaseReservationHold } from "@/lib/scheduling/reservation-hold";
import { paymentLinkIdFromMetadata } from "@/lib/payments/link-settlement";
import { releaseOrderPromoHolds } from "@/lib/promos/redemption/order-redemptions";

/**
 * F5 (Phase 0): the purchase pipeline placed the order, its hold and its money
 * row, but the Stripe Checkout session could not be created. Nobody can pay
 * that order, so it must not sit on the talent's calendar until the hold TTL
 * lapses. Only for a DEFINITE failure (Stripe created nothing); an uncertain
 * one keeps its hold so an idempotent retry can reuse the session. This
 * undoes it in the same order `createPurchase`'s own unwind does: slot, capacity, transaction, order. Every write is guarded on the row still
 * being unpaid, so a racing settle is never cancelled.
 *
 * `checkout.session.expired` / `async_payment_failed` for an instant order run
 * this same unwind through `unwindClosedCheckoutSession` (TUL-706). That event
 * carries only the transaction id, so allocations are looked up by order (held
 * ones only, TUL-1921); the booking, transaction and order are closed here.
 */
export type FailedCheckoutUnwindInput = {
  orderId: string;
  transactionId: string | null;
  /** TUL-714: the booking the purchase placed; cancelled while unpaid. */
  bookingId?: string | null;
  allocationIds: readonly string[];
  reservationHoldId: string | null;
  why: string;
};

export type FailedCheckoutUnwindDeps = {
  releaseHold: typeof releaseReservationHold;
  releaseAllocations: typeof releaseCapacity;
  /** Promos v1: the order's held promo uses go back to the pool. */
  releasePromos?: (db: SupabaseClient, orderId: string) => Promise<{ ok: boolean }>;
  /** TUL-1921: the order's still-held seat allocations (a Stripe event carries only the transaction id). */
  heldAllocationIds?: (db: SupabaseClient, orderId: string) => Promise<string[]>;
};

/**
 * TUL-1921: ids of the order's capacity allocations that are still a `hold`.
 * Only holds: `release_capacity` releases anything not yet released, so a
 * committed (paid) seat must never be handed to it. Failure reads as "none",
 * so the hold-expiry honoured by `capacity_remaining_public` still frees the seat.
 */
export async function heldAllocationIdsForOrder(db: SupabaseClient, orderId: string): Promise<string[]> {
  try {
    const { data: lines, error: lineErr } = await db.from("order_lines").select("id").eq("order_id", orderId);
    if (lineErr || !lines?.length) return [];
    const { data, error } = await db
      .from("capacity_allocations")
      .select("id")
      .in("order_line_id", (lines as Array<{ id: string }>).map((l) => l.id))
      .eq("state", "hold");
    if (error) return [];
    return ((data ?? []) as Array<{ id: string }>).map((r) => r.id);
  } catch {
    return [];
  }
}

const DEFAULT_DEPS: FailedCheckoutUnwindDeps = {
  releaseHold: releaseReservationHold,
  releaseAllocations: releaseCapacity,
  releasePromos: releaseOrderPromoHolds,
  heldAllocationIds: heldAllocationIdsForOrder,
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
  if (deps.releasePromos) {
    const promos = await deps.releasePromos(admin, input.orderId);
    if (!promos.ok) ok = false;
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
  if (input.bookingId) {
    // TUL-714 / TUL-706: the booking was confirmed at purchase; with no way to
    // pay it must not stay Confirmado or hold the slot. Guarded on unpaid.
    const cancelled = await cancelUnpaidBookings(admin, [input.bookingId]);
    if (!cancelled.ok) ok = false;
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

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const STILL_PAYABLE_TXN = new Set(["draft", "pending", "payment_requested"]);

/**
 * TUL-706 (b): Stripe will never take money on this Checkout session again
 * (expired, or a delayed method failed). For an instant-book money row, run
 * the failed-checkout unwind so the unpaid booking stops reading Confirmado and
 * the slot comes back now, not at the next cron. Payment-link rows are owned by
 * `closePaymentLinkForClosedCheckout`; paid / settled rows are never touched,
 * and every write inside the unwind is itself guarded on unpaid.
 */
export async function unwindClosedCheckoutSession(
  admin: SupabaseClient,
  input: { transactionId: string; reason: "expired" | "async_payment_failed" },
  deps: FailedCheckoutUnwindDeps = DEFAULT_DEPS,
): Promise<{ ok: boolean; outcome: "unwound" | "skipped" }> {
  // A foreign id would fail the uuid cast and Stripe would retry it for days.
  if (!UUID_RE.test(input.transactionId)) return { ok: true, outcome: "skipped" };
  const { data, error } = await admin
    .from("booking_transactions")
    .select("id, status, order_id, booking_id, metadata")
    .eq("id", input.transactionId)
    .maybeSingle();
  if (error) {
    logServerError("orders.unwindClosedCheckoutSession/read", error);
    return { ok: false, outcome: "skipped" };
  }
  const txn = data as
    | { id: string; status: string; order_id: string | null; booking_id: string | null; metadata: unknown }
    | null;
  if (!txn || !txn.order_id || !STILL_PAYABLE_TXN.has(txn.status)) return { ok: true, outcome: "skipped" };
  if (paymentLinkIdFromMetadata(txn.metadata)) return { ok: true, outcome: "skipped" };
  // TUL-1921: free the seat now (Stripe's session outlives the 15-minute hold);
  // the hold's own expiry remains the backstop if this lookup finds nothing.
  const allocationIds = deps.heldAllocationIds ? await deps.heldAllocationIds(admin, txn.order_id) : [];
  const res = await unwindFailedCheckout(
    admin,
    {
      orderId: txn.order_id,
      transactionId: txn.id,
      bookingId: txn.booking_id,
      allocationIds,
      reservationHoldId: null,
      why: `checkout_${input.reason}`,
    },
    deps,
  );
  return { ok: res.ok, outcome: "unwound" };
}
