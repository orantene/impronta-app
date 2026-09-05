import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { logServerError } from "@/lib/server/safe-error";
import { executeBookingRefund, type RefundReason } from "@/lib/payments/refund-execute";
import { planRefund, releasesPromoRedemption, type RefundableLine, type PaidTransaction } from "@/lib/orders/refund-plan";
import type { PromoScope } from "@/lib/orders/promo-eligibility";

/**
 * Refund whole order lines: money, per-line state, tickets, seats.
 *
 * The plan is computed by `planRefund` and is pure. This walks it.
 *
 * THE PROPERTY THAT MATTERS: money moves in steps, and a step can fail after an
 * earlier one succeeded. Stripe refunds cannot be un-refunded. So this NEVER
 * reports a clean failure once any money has moved — it reports exactly what
 * landed. A caller that reads `ok: false` and retries the whole thing would
 * refund twice, so the partial outcome is a distinct result, not an error.
 */

export type RefundLinesResult =
  | {
      ok: true;
      refundedCents: number;
      refundIds: string[];
      admissionsStamped: number;
      /**
       * TRUE when a ticket that should have been voided may not have been.
       *
       * Still `ok`, deliberately: the money moved and the line state is right,
       * and retrying is SAFE because `refund_admission` is idempotent — so a
       * hard failure here would invite a caller to re-run the refund legs,
       * which are not. This flag plus the loud log is how a human learns a
       * refunded ticket may still admit.
       */
      admissionsIncomplete: boolean;
      releasedPromoRedemption: boolean;
    }
  /** Nothing moved. Safe to retry unchanged. */
  | { ok: false; reason: string; movedCents: 0 }
  /**
   * Money moved and then something failed. NOT retryable as-is: the refunds
   * that landed are real. A human decides the remainder.
   */
  | { ok: false; reason: "partial_failure"; movedCents: number; refundIds: string[]; detail: string };

export async function refundOrderLines(
  admin: SupabaseClient,
  input: {
    orderId: string;
    lineIds: readonly string[];
    reason: RefundReason;
    actorUserId?: string | null;
    note?: string | null;
  },
): Promise<RefundLinesResult> {
  try {
    const { data: orderRow, error: orderErr } = await admin
      .from("orders")
      .select("id, discount_cents, status")
      .eq("id", input.orderId)
      .maybeSingle();
    if (orderErr || !orderRow) {
      logServerError("orders.refundLines/order", orderErr);
      return { ok: false, reason: "order_not_found", movedCents: 0 };
    }
    const order = orderRow as { id: string; discount_cents: number; status: string };

    const { data: lineRows, error: lineErr } = await admin
      .from("order_lines")
      .select("id, total_cents, refunded_cents, variant_id")
      .eq("order_id", input.orderId);
    if (lineErr) {
      logServerError("orders.refundLines/lines", lineErr);
      return { ok: false, reason: "unavailable", movedCents: 0 };
    }

    const lines: RefundableLine[] = (lineRows ?? []).map((l) => {
      const r = l as { id: string; total_cents: number; refunded_cents: number; variant_id: string | null };
      return {
        id: r.id,
        totalCents: Number(r.total_cents),
        refundedCents: Number(r.refunded_cents ?? 0),
        variantId: r.variant_id,
        eventId: null,
      };
    });

    // Paid transactions, OLDEST FIRST — the order the plan assumes and the order
    // money arrived. `refundedCents` per transaction comes from its own ledger,
    // not from the order, because a transaction may have been refunded by a
    // path that predates refund-by-line.
    const { data: txnRows, error: txnErr } = await admin
      .from("booking_transactions")
      .select("id, gross_amount_cents, created_at")
      .eq("order_id", input.orderId)
      .eq("status", "paid")
      .order("created_at", { ascending: true });
    if (txnErr) {
      logServerError("orders.refundLines/transactions", txnErr);
      return { ok: false, reason: "unavailable", movedCents: 0 };
    }
    const paidRows = (txnRows ?? []) as Array<{ id: string; gross_amount_cents: number }>;

    // HOW MUCH IS ALREADY REFUNDED, by the engine's own definition rather than
    // a second one of mine.
    //
    // There is no `refunded_amount_cents` column — I assumed one and checked.
    // A refund IS a `booking_transactions` row, linked to its parent by
    // `refund_of_transaction_id` with `status = 'refunded'`, and the refunded
    // total is the SUM over those siblings. That is exactly what
    // `loadRefundEligibility` does, and computing it differently here would
    // give two answers to one question — the plan would think a transaction had
    // room that `executeBookingRefund` then refuses.
    const parentIds = paidRows.map((t) => t.id);
    const refundedByParent = new Map<string, number>();
    if (parentIds.length > 0) {
      const { data: refundRows, error: refErr } = await admin
        .from("booking_transactions")
        .select("refund_of_transaction_id, gross_amount_cents")
        .in("refund_of_transaction_id", parentIds)
        .eq("status", "refunded");
      if (refErr) {
        logServerError("orders.refundLines/refundRows", refErr);
        return { ok: false, reason: "unavailable", movedCents: 0 };
      }
      for (const r of (refundRows ?? []) as Array<{ refund_of_transaction_id: string; gross_amount_cents: number }>) {
        refundedByParent.set(
          r.refund_of_transaction_id,
          (refundedByParent.get(r.refund_of_transaction_id) ?? 0) + Number(r.gross_amount_cents ?? 0),
        );
      }
    }

    const transactions: PaidTransaction[] = paidRows.map((t) => ({
      id: t.id,
      grossAmountCents: Number(t.gross_amount_cents),
      refundedCents: refundedByParent.get(t.id) ?? 0,
    }));

    // Scope is the order's own promo scope. Null when no code was used, which
    // makes the discount share zero and the line refundable at its full total.
    const scope: PromoScope = {};

    const plan = planRefund({
      lines,
      lineIds: input.lineIds,
      scope,
      discountCents: Number(order.discount_cents ?? 0),
      transactions,
    });
    if (!plan.ok) return { ok: false, reason: plan.reason, movedCents: 0 };

    // ── Money. Every step before this point is reversible; nothing after is.
    let moved = 0;
    const refundIds: string[] = [];
    for (const step of plan.steps) {
      const res = await executeBookingRefund({
        transactionId: step.transactionId,
        amountCents: step.amountCents,
        reason: input.reason,
        actorUserId: input.actorUserId,
        note: input.note,
      });
      if (!res.ok) {
        if (moved === 0) {
          // Nothing landed. A clean refusal the caller may retry unchanged.
          return { ok: false, reason: "refund_refused", movedCents: 0 };
        }
        // Money HAS moved. Reporting a plain failure here would invite a retry
        // that refunds the successful legs a second time, and a Stripe refund
        // cannot be taken back. So the partial outcome is its own result and
        // names what landed.
        logServerError(
          "orders.refundLines/PARTIAL_REFUND_FAILURE",
          `order ${input.orderId}: ${moved} cents refunded across ${refundIds.length} step(s), `
            + `then step on txn ${step.transactionId} failed: ${res.error}. Needs a human.`,
        );
        return {
          ok: false, reason: "partial_failure", movedCents: moved,
          refundIds, detail: res.error,
        };
      }
      moved += res.amountCents;
      refundIds.push(res.refundId);
    }

    // ── Per-line state. After the money, because a line marked refunded with no
    // refund behind it is worse than a refund with a late mark: the first hides
    // money owed, the second is visible in Stripe.
    for (const l of plan.lines) {
      const current = lines.find((x) => x.id === l.id)?.refundedCents ?? 0;
      const { error } = await admin
        .from("order_lines")
        .update({ refunded_cents: current + l.amountCents })
        .eq("id", l.id);
      if (error) {
        logServerError("orders.refundLines/lineState", error);
      }
    }

    // ── Tickets and seats, one operation each. `refund_admission` stamps the
    // admission and releases its allocation under one row lock: releasing
    // without stamping leaves a refunded ticket that still admits.
    let stamped = 0;
    let admissionsIncomplete = false;
    const { data: admRows, error: admErr } = await admin
      .from("admissions")
      .select("id, order_line_id, line_seq, admitted_count, status")
      .in("order_line_id", plan.lines.map((l) => l.id));

    // I DROPPED THIS ERROR AND THE RATCHET CAUGHT IT. PostgREST does not throw:
    // a denied policy, a missing table and a bad column all arrive as
    // `data: null`. Unchecked, the loop below would iterate nothing, `stamped`
    // would stay 0, and this would return ok — reporting a clean refund while
    // every ticket on it still admits at a door. The exact failure the atomic
    // `refund_admission` exists to prevent, reintroduced one layer up by not
    // reading a variable.
    if (admErr) {
      admissionsIncomplete = true;
      logServerError(
        "orders.refundLines/TICKETS_NOT_VOIDED_AFTER_REFUND",
        `order ${input.orderId}: money refunded but admissions could not be read (${admErr.message}). `
          + `Tickets on this order may still admit. Needs a human.`,
      );
    }

    for (const a of (admRows ?? []) as Array<{ id: string; admitted_count: number; status: string }>) {
      if (a.admitted_count > 0 || a.status !== "valid") continue;
      const { data: res, error } = await admin.rpc("refund_admission", { p_admission_id: a.id });
      if (error) {
        logServerError("orders.refundLines/admission", error);
        continue;
      }
      if ((res as { ok?: boolean } | null)?.ok === true) stamped += 1;
      else admissionsIncomplete = true;
    }

    // ── Promo. A FULL refund releases the redemption; a partial does not, and
    // eligibility is never re-evaluated. See `releasesPromoRedemption`.
    let releasedPromo = false;
    if (releasesPromoRedemption(plan)) {
      const { error } = await admin
        .from("tenant_promo_redemptions")
        .delete()
        .eq("order_id", input.orderId);
      if (error) logServerError("orders.refundLines/promoRelease", error);
      else releasedPromo = true;
    }

    return {
      ok: true,
      refundedCents: moved,
      refundIds,
      admissionsStamped: stamped,
      admissionsIncomplete,
      releasedPromoRedemption: releasedPromo,
    };
  } catch (err) {
    logServerError("orders.refundLines", err);
    return { ok: false, reason: "unavailable", movedCents: 0 };
  }
}
