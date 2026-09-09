/**
 * Settle a pay-at-door held order: record the collection, then complete.
 *
 * Payment recording, allocation (via completeOrder), and admission mint
 * (onOrderPaid) stay separate so a unique admission constraint cannot be
 * mistaken for financial idempotency.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { logServerError } from "@/lib/server/safe-error";
import { completeOrderForTransaction } from "@/lib/orders/complete-order";
import type { OnOrderPaid } from "@/lib/orders/complete-order";
import { bookingShellForOrder, type BookingShellContact } from "@/lib/orders/booking-shell";
import {
  RESERVATION_METADATA_KEY,
  settleCollectionReservation,
} from "@/lib/pos/collection-reservations";

export type DoorSettleInput = {
  tenantId: string;
  orderId: string;
  actorUserId: string;
  paidVia: "cash" | "card";
  amountCents: number;
  currency: string;
  idempotencyKey: string;
  /** Open POS shift this tender belongs to. Absent when no shift is open. */
  shiftId?: string | null;
  /** What the operator counted into the drawer. Defaults to amountCents. */
  tenderedCents?: number;
  /** Stamped on the booking shell if this settlement is the one that creates it. */
  contact?: BookingShellContact;
  /**
   * The claim on the order's outstanding balance this tender is completing.
   *
   * Closed ONLY after the transaction actually reaches `paid`. Closing it any
   * earlier would say the money is in while this row still says it is not, and
   * a reservation that lies is worse than no reservation: the balance would be
   * neither reserved nor paid, and the next till would collect it again.
   */
  reservationId?: string | null;
};

export type DoorSettleResult =
  | { ok: true; orderId: string; transactionId: string; alreadySettled: boolean }
  | { ok: false; reason: "not_found" | "wrong_tenant" | "not_held" | "amount" | "unavailable" };

/**
 * Walk a door transaction from wherever it is to `paid`.
 *
 * RESUMABLE, and that is the point rather than a nicety. The graph has no
 * draft → paid edge, so recording cash takes two updates, and a process that
 * dies between them leaves a row short of `paid`. The idempotency key is
 * written at INSERT precisely so the retry finds that row — but the retry then
 * has to finish the walk. Completing the ORDER while its transaction still sat
 * at `draft` would mark the sale done with the money recorded as not received,
 * which is the false-paid state inverted and just as wrong.
 *
 * Steps already taken are skipped rather than re-issued, because the graph
 * refuses paid → payment_requested: re-walking blindly would turn a settled
 * transaction into a failed update.
 */
async function walkToPaid(
  admin: Pick<SupabaseClient, "from">,
  transactionId: string,
  from: string,
): Promise<boolean> {
  const remaining = (["payment_requested", "paid"] as const).filter((step) =>
    from === "draft" ? true : step === "paid" && from === "payment_requested",
  );
  for (const next of remaining) {
    const { error } = await admin
      .from("booking_transactions")
      .update({ status: next })
      .eq("id", transactionId);
    if (error) {
      logServerError(`orders.settleAtDoor/transition:${next}`, error);
      return false;
    }
  }
  return true;
}

/**
 * Bind the claim to the money row, now that the money row is paid.
 *
 * Best effort ON PURPOSE. The cash is in the drawer and the transaction says
 * `paid`; a failure to close the claim leaves it live until the reaper takes
 * it, which delays the next collection on this tab by the TTL. Failing the
 * settle instead would tell an operator the cash was not recorded when it was.
 */
async function closeReservation(
  admin: SupabaseClient,
  reservationId: string | null | undefined,
  transactionId: string,
): Promise<void> {
  if (!reservationId) return;
  const closed = await settleCollectionReservation(admin, { reservationId, transactionId });
  if (!closed.ok) {
    logServerError(
      "orders.settleAtDoor/reservation",
      `transaction ${transactionId} is paid but reservation ${reservationId} did not close (${closed.reason})`,
    );
  }
}

export async function settleAtDoor(
  admin: SupabaseClient,
  input: DoorSettleInput,
  deps: { onOrderPaid?: OnOrderPaid } = {},
): Promise<DoorSettleResult> {
  if (!Number.isInteger(input.amountCents) || input.amountCents < 0) {
    return { ok: false, reason: "amount" };
  }

  const { data: order, error } = await admin
    .from("orders")
    .select("id, tenant_id, status, total_cents, currency")
    .eq("id", input.orderId)
    .maybeSingle();
  if (error) {
    logServerError("orders.settleAtDoor/order", error);
    return { ok: false, reason: "unavailable" };
  }
  if (!order) return { ok: false, reason: "not_found" };
  const row = order as {
    id: string; tenant_id: string; status: string; total_cents: number; currency: string | null;
  };
  if (row.tenant_id !== input.tenantId) return { ok: false, reason: "wrong_tenant" };
  if (row.status === "paid" || row.status === "fulfilled") {
    const { data: existing, error: existingErr } = await admin
      .from("booking_transactions")
      .select("id")
      .eq("order_id", row.id)
      .eq("provider_reference", input.idempotencyKey)
      .maybeSingle();
    if (existingErr) {
      logServerError("orders.settleAtDoor/existing", existingErr);
      return { ok: false, reason: "unavailable" };
    }
    const priorId = (existing as { id?: string } | null)?.id ?? null;
    if (priorId) await closeReservation(admin, input.reservationId, priorId);
    return {
      ok: true,
      orderId: row.id,
      transactionId: priorId ?? "already-paid",
      alreadySettled: true,
    };
  }
  if (row.status !== "pending_payment" && row.status !== "draft") {
    return { ok: false, reason: "not_held" };
  }

  const { data: prior, error: priorErr } = await admin
    .from("booking_transactions")
    .select("id, status")
    .eq("order_id", row.id)
    .eq("provider_reference", input.idempotencyKey)
    .maybeSingle();
  if (priorErr) {
    logServerError("orders.settleAtDoor/prior", priorErr);
    return { ok: false, reason: "unavailable" };
  }
  if (prior?.id) {
    // `status` is read, not assumed. A previous attempt that died mid-walk left
    // this row at `draft` or `payment_requested`, and completing the order on
    // top of that would call the sale settled while its own money row says the
    // cash was never received.
    const priorRow = prior as { id: string; status?: string | null };
    const resumed = await walkToPaid(admin, priorRow.id, priorRow.status ?? "draft");
    if (!resumed) return { ok: false, reason: "unavailable" };
    const done = await completeOrderForTransaction(admin, priorRow.id, deps);
    if (!done.ok) return { ok: false, reason: "unavailable" };
    await closeReservation(admin, input.reservationId, priorRow.id);
    return { ok: true, orderId: row.id, transactionId: priorRow.id, alreadySettled: true };
  }

  // The booking behind the money. `trg_booking_transactions_scope` refuses a
  // transaction whose `booking_id` does not resolve, so this is not
  // bookkeeping tidiness — without it the insert below is rejected and the
  // cash the operator has already taken is never recorded. Find-or-create, so
  // a split tab or a re-run card settles onto the order's existing shell
  // rather than minting a second sale.
  const shell = await bookingShellForOrder(admin, {
    tenantId: input.tenantId,
    orderId: row.id,
    currency: input.currency || row.currency || "usd",
    revenue: input.amountCents / 100,
    contact: input.contact,
  });
  if (!shell.ok) return { ok: false, reason: "unavailable" };

  // Inserted as `draft`, then walked to `paid`.
  //
  // This used to insert `status: 'paid'` outright, which
  // `validate_booking_transaction_status_transition` forbids: the only legal
  // initial states are `draft` and a `refunded` row that references its parent.
  // So every door settlement raised `initial status must be draft`, came back
  // as `unavailable`, and told the operator "Could not record the cash" after
  // the cash was already in the drawer.
  //
  // The graph has no draft → paid edge, and that is not an obstacle to route
  // around: `payment_requested` is what makes the intermediate state
  // observable, and the trigger stamps `requested_at` and `paid_at` itself on
  // entry to each, so the timestamps come from the database rather than from
  // three separate clocks.
  //
  // `provider: 'manual'` is what exempts this from needing a payout receiver.
  // Cash across a counter has no payout destination — see
  // 20261230001500, which restores the rail-aware rule phase 8 dropped.
  const { data: inserted, error: insErr } = await admin
    .from("booking_transactions")
    .insert({
      booking_id: shell.bookingId,
      order_id: row.id,
      source_tenant_id: input.tenantId,
      gross_amount_cents: input.amountCents,
      platform_fee_cents: 0,
      net_amount_cents: input.amountCents,
      currency: input.currency || row.currency || "usd",
      provider: "manual",
      provider_reference: input.idempotencyKey,
      status: "draft",
      metadata: {
        paid_via: input.paidVia,
        settled_at: "door",
        actor: input.actorUserId,
        ...(input.shiftId ? { shift_id: input.shiftId } : {}),
        tendered_cents: input.tenderedCents ?? input.amountCents,
        change_cents: (input.tenderedCents ?? input.amountCents) - input.amountCents,
        // Same key the card path uses, so one reconciler can walk both rails.
        ...(input.reservationId ? { [RESERVATION_METADATA_KEY]: input.reservationId } : {}),
      },
    })
    .select("id")
    .single();
  if (insErr || !inserted) {
    logServerError("orders.settleAtDoor/insert", insErr ?? new Error("no row"));
    return { ok: false, reason: "unavailable" };
  }

  const walked = await walkToPaid(admin, inserted.id as string, "draft");
  if (!walked) return { ok: false, reason: "unavailable" };

  const settled = await completeOrderForTransaction(admin, inserted.id as string, deps);
  if (!settled.ok) return { ok: false, reason: "unavailable" };
  await closeReservation(admin, input.reservationId, inserted.id as string);
  return { ok: true, orderId: row.id, transactionId: inserted.id as string, alreadySettled: false };
}
