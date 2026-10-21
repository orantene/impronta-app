import type { SupabaseClient } from "@supabase/supabase-js";
import { logServerError } from "@/lib/server/safe-error";
import { admissionIsRefundable, classifyAdmissionEffect } from "@/lib/orders/refund-admissions";
import { voidRedemptionPatch } from "@/lib/orders/promo-redemption-status";

/**
 * Put back what a refund took off the shelf: tickets, seats, stock, promo.
 *
 * ONE STEP FOR EVERY REFUND ROUTE (TUL-1268 M5, TUL-941). The Orders desk
 * (`refundOrderLines`) restores the lines it refunds. Every other route (a
 * Stripe dashboard refund, `refundTransactionAction`, the talent refund, a lost
 * dispute) books its money through the webhook (`payments/refunds.ts`), which
 * used to stop at the payouts: tickets still admitted, seats stayed committed,
 * the promo still counted against its limit. Both now call this.
 *
 * EXACTLY ONCE, BY IDENTITY. A desk refund restores, then its own
 * `charge.refunded` arrives and restores again; a webhook is re-delivered; a
 * second partial completes a charge. Each write here is a no-op the second
 * time, and none is a counter:
 *   - `refund_admission` returns `already` for a refunded admission and frees
 *     its allocation in the same row lock;
 *   - `release_capacity` only moves allocations not yet `released`;
 *   - the promo update only matches `confirmed` / `held` rows.
 * So a replay can never free a seat still in someone's pocket or un-void twice.
 *
 * Never throws: the money already moved, so a bookkeeping failure is logged
 * loudly and reported, never turned into a retry of the refund itself.
 */

export type RestoreRefundedLinesResult = {
  admissionsStamped: number;
  stampedAdmissionIds: string[];
  /** TRUE when a ticket that should have been voided may not have been. */
  admissionsIncomplete: boolean;
  /** Allocations freed for lines without admissions (session seats, pooled stock). */
  allocationsReleased: number;
  releasedPromoRedemption: boolean;
};

export async function restoreRefundedLines(
  admin: SupabaseClient,
  input: {
    orderId: string;
    /** Lines whose tickets are refunded (the desk's whole plan; every paid line on a full refund). */
    lineIds: readonly string[];
    /**
     * Lines refunded IN FULL. Only these give back non-ticket capacity:
     * `release_capacity` frees whole allocations, so freeing one for a partly
     * refunded line would resell units still owed (see `capacityReleaseFor`).
     */
    wholeLineIds: readonly string[];
    /** Void the order's promo redemption (a FULL refund only; see `releasesPromoRedemption`). */
    releasePromo: boolean;
    logScope: string;
    /**
     * Per-ticket refunds (TUL-1429/1431): void ONLY these admissions, not every
     * ticket on the line. Undefined = every refundable ticket on `lineIds`
     * (the whole-line behaviour); an empty array voids none (a price
     * difference refund where the ticket stays valid). A set value never frees
     * non-ticket capacity, because the line is not refunded whole.
     */
    onlyAdmissionIds?: readonly string[];
  },
): Promise<RestoreRefundedLinesResult> {
  const out: RestoreRefundedLinesResult = {
    admissionsStamped: 0,
    stampedAdmissionIds: [],
    admissionsIncomplete: false,
    allocationsReleased: 0,
    releasedPromoRedemption: false,
  };
  let wholeLineIds = input.onlyAdmissionIds ? [] : input.wholeLineIds;
  const only = input.onlyAdmissionIds ? new Set(input.onlyAdmissionIds) : null;
  try {
    // ── Tickets and their seats, one operation each. `refund_admission` stamps
    // the admission and releases its allocation under one row lock: releasing
    // without stamping leaves a refunded ticket that still admits.
    const linesWithAdmissions = new Set<string>();
    if (input.lineIds.length > 0) {
      const { data: admRows, error: admErr } = await admin
        .from("admissions")
        .select("id, order_line_id, line_seq, admitted_count, status")
        .in("order_line_id", [...input.lineIds]);

      // PostgREST does not throw: a denied policy or a bad column arrives as
      // `data: null`. Unchecked, nothing below would run and this would report a
      // clean refund while every ticket on it still admits.
      if (admErr) {
        out.admissionsIncomplete = true;
        logServerError(
          `${input.logScope}/TICKETS_NOT_VOIDED_AFTER_REFUND`,
          `order ${input.orderId}: money refunded but admissions could not be read (${admErr.message}). `
            + `Tickets on this order may still admit. Needs a human.`,
        );
      }

      // `void` is refundable, not skippable: `cancel_event_cascade` closes the
      // door first and the refund lands here later. Every reply is classified,
      // and an RPC error is an outcome (see `classifyAdmissionEffect`).
      for (const a of (admRows ?? []) as Array<{ id: string; order_line_id: string; admitted_count: number; status: string }>) {
        linesWithAdmissions.add(a.order_line_id);
        if (only && !only.has(a.id)) continue;
        if (!admissionIsRefundable({ admittedCount: a.admitted_count, status: a.status })) continue;
        const { data: res, error } = await admin.rpc("refund_admission", { p_admission_id: a.id });
        const effect = classifyAdmissionEffect(res as { ok?: boolean; reason?: string } | null, error);
        if (effect.effect === "stamped") {
          out.admissionsStamped += 1;
          out.stampedAdmissionIds.push(a.id);
        } else if (effect.effect === "incomplete") {
          out.admissionsIncomplete = true;
          logServerError(
            `${input.logScope}/TICKETS_NOT_VOIDED_AFTER_REFUND`,
            `order ${input.orderId}: money refunded but admission ${a.id} was not stamped `
              + `(${effect.why}: ${effect.reason ?? "no reason given"}). That ticket may still `
              + `admit and its seat is still committed. Retry is safe — refund_admission is `
              + `idempotent — but the refund legs are NOT. Needs a human.`,
          );
        }
      }
      if (admErr) {
        // Without the admissions read we cannot tell ticket lines from the
        // rest, and releasing a ticket line's allocation without stamping its
        // admission is the two-call gap `refund_admission` exists to close.
        wholeLineIds = [];
      }
    }

    // ── Seats and stock on lines WITHOUT tickets (a session seat, a pooled
    // menu item). Their allocations hang off `capacity_allocations.order_line_id`.
    // Ticket lines are left to `refund_admission` above: an attended ticket's
    // seat must stay committed, and that refusal lives under its row lock.
    const releasable = wholeLineIds.filter((id) => !linesWithAdmissions.has(id));
    if (releasable.length > 0) {
      const { data: allocRows, error: allocErr } = await admin
        .from("capacity_allocations")
        .select("id")
        .in("order_line_id", releasable)
        .neq("state", "released");
      if (allocErr) {
        logServerError(
          `${input.logScope}/CAPACITY_NOT_RELEASED_AFTER_REFUND`,
          `order ${input.orderId}: allocations could not be read (${allocErr.message}). Seats or stock on lines `
            + `${releasable.join(",")} may still be held. Needs a human.`,
        );
      } else {
        const ids = ((allocRows ?? []) as Array<{ id: string }>).map((r) => r.id);
        if (ids.length > 0) {
          const { data: rel, error: relErr } = await admin.rpc("release_capacity", { p_allocation_ids: ids });
          if (relErr) {
            logServerError(
              `${input.logScope}/CAPACITY_NOT_RELEASED_AFTER_REFUND`,
              `order ${input.orderId}: release_capacity failed (${relErr.message}). Needs a human.`,
            );
          } else {
            out.allocationsReleased = Number((rel as { released?: number } | null)?.released ?? 0);
          }
        }
      }
    }

    // ── Promo. Released by VOIDING the row, never deleting it: a voided row no
    // longer counts against the code's limits, and the audit trail survives.
    if (input.releasePromo) {
      const { error } = await admin
        .from("tenant_promo_redemptions")
        .update(voidRedemptionPatch())
        .eq("order_id", input.orderId)
        .in("status", ["confirmed", "held"]);
      if (error) logServerError(`${input.logScope}/promoRelease`, error);
      else out.releasedPromoRedemption = true;
    }
  } catch (err) {
    out.admissionsIncomplete = true;
    logServerError(`${input.logScope}/restore`, err);
  }
  return out;
}

type RestoreLineRow = {
  id: string;
  unit_cents: number | null;
  discount_cents: number | null;
  total_cents: number | null;
};

/**
 * A true comp line: listed at $0 (a comp tier or free item), never charged, so a
 * refund gives nothing back for it and must not void the guest's ticket.
 *
 * Read from the LIST price (`unit_cents`, the catalog price written at
 * purchase), never from `total_cents`: a promo can discount a paid ticket to a
 * $0 total, and that guest's ticket must still be refunded with the order.
 * A line that carries a discount had a price, so it is never a comp.
 */
export function isCompLine(l: Omit<RestoreLineRow, "id">): boolean {
  return (
    Number(l.unit_cents ?? 0) <= 0
    && Number(l.discount_cents ?? 0) <= 0
    && Number(l.total_cents ?? 0) <= 0
  );
}

/** Statuses in which a charge still holds the customer's money. */
const MONEY_HELD_STATUSES = ["paid", "payout_pending", "payout_sent", "disputed"] as const;

export type RestoreAfterChargeResult =
  | { restored: true; orderId: string; result: RestoreRefundedLinesResult }
  | { restored: false; reason: "no_order" | "order_still_paid" | "unavailable" };

/**
 * The webhook's restore: a charge is now FULLY refunded (charge.refunded with
 * the whole charge back, or a lost dispute). Restores the order's paid lines
 * only when no other charge on the order still holds money; a deposit refunded
 * while the balance stands is not a refunded order.
 *
 * Partial refunds never come here: a Stripe refund names an amount, not units,
 * so there is nothing to say which ticket or seat went back. The desk, which
 * does name the lines, restores those through `restoreRefundedLines` directly.
 */
export async function restoreAfterChargeFullyRefunded(
  sb: SupabaseClient,
  input: { transactionId: string },
): Promise<RestoreAfterChargeResult> {
  const scope = "refunds.restoreInventory";
  try {
    const { data: txnData, error: txnErr } = await sb
      .from("booking_transactions")
      .select("order_id")
      .eq("id", input.transactionId)
      .maybeSingle();
    if (txnErr) {
      logServerError(`${scope}.txn`, txnErr);
      return { restored: false, reason: "unavailable" };
    }
    const orderId = (txnData as { order_id?: string | null } | null)?.order_id ?? null;
    if (!orderId) return { restored: false, reason: "no_order" };

    const { data: siblings, error: sibErr } = await sb
      .from("booking_transactions")
      .select("id, status, refund_of_transaction_id")
      .eq("order_id", orderId)
      .in("status", [...MONEY_HELD_STATUSES]);
    if (sibErr) {
      logServerError(`${scope}.siblings`, sibErr);
      return { restored: false, reason: "unavailable" };
    }
    const stillHeld = ((siblings ?? []) as Array<{ id: string; refund_of_transaction_id: string | null }>).some(
      (t) => t.id !== input.transactionId && !t.refund_of_transaction_id,
    );
    if (stillHeld) return { restored: false, reason: "order_still_paid" };

    const { data: lineRows, error: lineErr } = await sb
      .from("order_lines")
      .select("id, unit_cents, discount_cents, total_cents")
      .eq("order_id", orderId);
    if (lineErr) {
      logServerError(`${scope}.lines`, lineErr);
      return { restored: false, reason: "unavailable" };
    }
    const lineIds = ((lineRows ?? []) as RestoreLineRow[]).filter((l) => !isCompLine(l)).map((l) => l.id);

    const result = await restoreRefundedLines(sb, {
      orderId,
      lineIds,
      wholeLineIds: lineIds,
      releasePromo: true,
      logScope: scope,
    });
    return { restored: true, orderId, result };
  } catch (err) {
    logServerError(scope, err);
    return { restored: false, reason: "unavailable" };
  }
}
