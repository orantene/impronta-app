import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { logServerError } from "@/lib/server/safe-error";
import { commitCapacity } from "@/lib/capacity";

/**
 * THE COMPLETION PATH. Step 12 of the 0.6 design, and until now it did not exist.
 *
 * HOW IT WAS MISSED, because that is the more useful part. `createPurchase` had
 * tests for everything it WRITES — the order, the lines, the booking, the
 * transaction, the compensation on every refusal. Not one of them asked what
 * COMPLETES an order. So a pipeline shipped whose orders could reach
 * `pending_payment` and never leave it, with every lane green, and the manager
 * who needed the completion found it rather than the person who built it.
 *
 * A test suite that only asserts what a function writes cannot see a missing
 * successor. This file's tests assert the transition, not the row.
 *
 * WHAT IT COSTS TO NOT HAVE THIS: staff take the money, `markPaid` flips the
 * TRANSACTION, and the order sits in `pending_payment` for ever — a state that
 * says a customer owes money on a sale that completed. Where capacity is held,
 * the hold lapses and the seat comes back WHILE THE CUSTOMER HAS PAID. The
 * engine this pipeline replaces gets that right, because it force-writes its way
 * to a completed booking; shipping the clean path before its completion existed
 * would have been a downgrade wearing a cleanup's clothes.
 */

export type CompleteOrderResult =
  | { ok: true; orderId: string; status: "paid" | "pending_payment"; committed: number }
  | { ok: false; reason: "no_order" | "not_found" | "unavailable"; error?: string };

/**
 * Settle the order behind a paid transaction.
 *
 * Called from the webhook seam AFTER the transaction is already `paid`. It is
 * deliberately separate from that flip: a transaction is a payment and an order
 * is a sale, and one payment does not always complete a sale (a deposit does
 * not).
 */
export async function completeOrderForTransaction(
  admin: SupabaseClient,
  transactionId: string,
): Promise<CompleteOrderResult> {
  try {
    const { data: txn, error: txnErr } = await admin
      .from("booking_transactions")
      .select("id, order_id, gross_amount_cents, status")
      .eq("id", transactionId)
      .maybeSingle();

    if (txnErr) {
      logServerError("orders.completeOrder/txn", txnErr);
      return { ok: false, reason: "unavailable" };
    }
    const orderId = (txn as { order_id?: string | null } | null)?.order_id ?? null;

    // A transaction with no order is the pre-pipeline world and is not an error.
    // Every quoted job before 0.5 has one, and they are settled by the booking
    // spine exactly as before.
    if (!orderId) return { ok: false, reason: "no_order" };

    const { data: order, error: orderErr } = await admin
      .from("orders")
      .select("id, status, total_cents, version")
      .eq("id", orderId)
      .maybeSingle();

    if (orderErr) {
      logServerError("orders.completeOrder/order", orderErr);
      return { ok: false, reason: "unavailable" };
    }
    if (!order) return { ok: false, reason: "not_found" };

    const row = order as { id: string; status: string; total_cents: number; version: number };

    // Already settled. Idempotent because webhooks redeliver, and a second
    // delivery must not re-commit capacity or re-emit anything.
    if (row.status === "paid" || row.status === "fulfilled") {
      return { ok: true, orderId, status: "paid", committed: 0 };
    }

    // ── DECISION 1: verify the AMOUNT before flipping, and count every paid
    //    transaction rather than this one alone.
    //
    // A deposit is a real payment that does NOT complete a sale. Flipping on
    // any paid transaction would mark a 25%-deposit order as paid in full and
    // stop anyone chasing the balance. So the order completes only when the
    // collected total reaches what the order says it costs.
    const { data: paidRows, error: paidErr } = await admin
      .from("booking_transactions")
      .select("gross_amount_cents")
      .eq("order_id", orderId)
      .eq("status", "paid");

    if (paidErr) {
      logServerError("orders.completeOrder/collected", paidErr);
      return { ok: false, reason: "unavailable" };
    }

    const collected = (paidRows ?? []).reduce(
      (sum, r) => sum + Number((r as { gross_amount_cents: number }).gross_amount_cents ?? 0),
      0,
    );

    if (collected < row.total_cents) {
      // Part-paid. The order stays where it is and the balance is still owed —
      // which is the honest state, and the one the thread card reads to show
      // what is outstanding.
      return { ok: true, orderId, status: "pending_payment", committed: 0 };
    }

    // ── DECISION 2: commit capacity BEFORE the status flip, and never let its
    //    failure stop the flip.
    //
    // `commit_capacity` REFUSES an expired hold rather than reviving it, because
    // those units may already belong to whoever reserved after the lapse. So
    // "the money landed but the hold lapsed" is a real branch, not an edge case.
    //
    // The answer is that the order still becomes `paid`. A charge has completed;
    // rolling that back to fix a seat problem would take money from a customer
    // to tidy a ledger. It alerts loudly instead, because a paid order with no
    // seat needs a human within minutes.
    const { data: allocRows, error: allocErr } = await admin
      .from("capacity_allocations")
      .select("id, order_line_id")
      .in(
        "order_line_id",
        ((await admin.from("order_lines").select("id").eq("order_id", orderId)).data ?? []).map(
          (l) => (l as { id: string }).id,
        ),
      )
      .eq("state", "hold");

    if (allocErr) logServerError("orders.completeOrder/allocations", allocErr);

    let committed = 0;
    const allocationIds = (allocRows ?? []).map((a) => (a as { id: string }).id);
    if (allocationIds.length > 0) {
      const result = await commitCapacity(allocationIds, null, admin);
      if (result.ok) {
        committed = result.committed;
      } else {
        logServerError(
          "orders.completeOrder/CAPACITY_LOST_AFTER_PAYMENT",
          `order ${orderId} paid but capacity could not be committed (${result.reason}) — `
            + `a customer has paid for something they may no longer hold. Needs a human.`,
        );
      }
    }

    // ── DECISION 3: the flip is optimistic-concurrency guarded, and a failure
    //    AFTER this point never rolls it back.
    const { error: flipErr } = await admin
      .from("orders")
      .update({ status: "paid", hold_expires_at: null, version: row.version + 1 })
      .eq("id", orderId)
      .eq("version", row.version);

    if (flipErr) {
      logServerError("orders.completeOrder/flip", flipErr);
      return { ok: false, reason: "unavailable", error: "Could not settle the order." };
    }

    return { ok: true, orderId, status: "paid", committed };
  } catch (err) {
    logServerError("orders.completeOrder", err);
    return { ok: false, reason: "unavailable" };
  }
}
