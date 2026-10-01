/**
 * What a booking cancel does to the money around it (QA on Jor, 2026-10-01).
 *
 * THE DEFECT. Cancelling an agenda booking left its order `pending_payment`
 * and its `/pay/<code>` link open: a client paid 300 MXN after the cancel, and
 * the dialog had promised "No se cobró ningún pago" while a payment existed.
 *
 * On cancel, in order:
 *   1. read what was paid from the LEDGER (`booking_transactions`), never the UI;
 *   2. take down every open payment link of the order (`cancelPaymentLink`
 *      expires the bound Stripe Checkout session first);
 *   3. nothing paid: the order is voided (`cancelled`, the order vocabulary for
 *      "the sale did not happen"). Something paid: the order keeps its money
 *      state and the talent refunds by hand from Money.
 *
 * Idempotent: a second cancel finds no open links and an already-cancelled
 * order, and writes nothing.
 *
 * A payment that still lands after this (a session that completed while the
 * cancel ran) is caught at settle time: see `paid-after-cancel.ts`.
 */

import { logServerError } from "@/lib/server/safe-error";
import { boundSessionIsComplete } from "@/lib/payments/link-checkout";
import { retrieveCheckoutSessionLink } from "@/lib/payments/stripe-checkout";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Admin = { from: (table: string) => any; rpc?: (fn: string, args: Record<string, unknown>) => any };

/** A money row in one of these states is money the client has handed over. */
export const LEDGER_SETTLED_STATUSES = ["paid", "payout_pending", "payout_sent"] as const;

/** Order statuses a cancel may void: no money has been recorded as taken. */
export const VOIDABLE_ORDER_STATUSES = ["draft", "quoted", "pending_payment"] as const;

export type CancelPaymentLinkFn = (
  admin: Admin,
  input: { tenantId: string; linkId: string },
) => Promise<{ ok: true; already: boolean } | { ok: false; reason: "not_found" | "already_paid" | "unavailable" }>;

/** Sum of settled money on an order, from the ledger. null when it cannot be read. */
export async function ledgerPaidCents(admin: Admin, orderId: string | null): Promise<number | null> {
  if (!orderId) return 0;
  const { data, error } = await admin
    .from("booking_transactions")
    .select("gross_amount_cents, status")
    .eq("order_id", orderId);
  if (error) {
    logServerError("agenda.cancelMoney.ledger", error);
    return null;
  }
  let paid = 0;
  for (const row of (data ?? []) as Array<{ gross_amount_cents: number | null; status: string }>) {
    if ((LEDGER_SETTLED_STATUSES as readonly string[]).includes(row.status)) {
      paid += Number(row.gross_amount_cents) || 0;
    }
  }
  return paid;
}

/**
 * Read-only: does an open pay link of this order have a Checkout session that
 * already completed (card payment arriving, not settled in the ledger yet)?
 * The same condition the post-cancel path reports as `paymentInFlight`.
 * null when it cannot be read.
 */
export async function paymentInFlightForOrder(
  admin: Admin,
  orderId: string | null,
  retrieve: Parameters<typeof boundSessionIsComplete>[2] = retrieveCheckoutSessionLink,
): Promise<boolean | null> {
  if (!orderId) return false;
  const { data, error } = await admin
    .from("payment_links")
    .select("reservation_id")
    .eq("order_id", orderId)
    .eq("status", "open");
  if (error) {
    logServerError("agenda.cancelMoney.inFlight", error);
    return null;
  }
  let unknown = false;
  for (const row of (data ?? []) as Array<{ reservation_id: string | null }>) {
    if (!row.reservation_id) continue;
    const done = await boundSessionIsComplete(admin, row.reservation_id, retrieve);
    if (done === true) return true;
    if (done === null) unknown = true;
  }
  return unknown ? null : false;
}

export type CancelMoneyResult = {
  ok: boolean;
  /** Settled money on the order at the time of the cancel. */
  paidCents: number;
  /** Open links taken down by this call. */
  linksVoided: number;
  /** A link whose Checkout session had already completed: money is on its way. */
  paymentInFlight: boolean;
  /** The order was moved to `cancelled` by this call. */
  orderVoided: boolean;
  /** Money was taken or is landing: the talent refunds by hand from Money. */
  needsManualRefund?: boolean;
};

/**
 * Close a still-open link row in the DB without touching Stripe. True when this
 * call closed it, false when it was not open, null on a write error.
 */
async function closeOpenLinkRow(admin: Admin, tenantId: string, linkId: string): Promise<boolean | null> {
  const { data, error } = await admin
    .from("payment_links")
    .update({ status: "cancelled" })
    .eq("id", linkId)
    .eq("tenant_id", tenantId)
    .eq("status", "open")
    .select("id");
  if (error) {
    logServerError("agenda.cancelMoney.closeInFlightLink", error);
    return null;
  }
  return Array.isArray(data) && data.length > 0;
}

export async function settleMoneyOnCancel(
  admin: Admin,
  input: { tenantId: string; orderId: string | null },
  deps: { cancelPaymentLink: CancelPaymentLinkFn },
): Promise<CancelMoneyResult> {
  const out: CancelMoneyResult = { ok: true, paidCents: 0, linksVoided: 0, paymentInFlight: false, orderVoided: false };
  if (!input.orderId) return out;

  const { data: links, error: linksErr } = await admin
    .from("payment_links")
    .select("id")
    .eq("tenant_id", input.tenantId)
    .eq("order_id", input.orderId)
    .eq("status", "open");
  if (linksErr) {
    logServerError("agenda.cancelMoney.links", linksErr);
    out.ok = false;
  }
  for (const link of (links ?? []) as Array<{ id: string }>) {
    const killed = await deps.cancelPaymentLink(admin, { tenantId: input.tenantId, linkId: link.id });
    if (killed.ok) {
      if (!killed.already) out.linksVoided += 1;
    } else if (killed.reason === "already_paid") {
      // The Checkout session completed (money in flight) or the link row is
      // already paid. Either way the link must not stay payable on a
      // cancelled booking: close the row here, even though the session could
      // not be expired. The webhook still records the money and flags it
      // `paid_after_cancellation` (the booking is cancelled by then).
      out.paymentInFlight = true;
      out.needsManualRefund = true;
      const closed = await closeOpenLinkRow(admin, input.tenantId, link.id);
      if (closed === null) out.ok = false;
      else if (closed) out.linksVoided += 1;
    } else {
      out.ok = false;
    }
  }

  const paid = await ledgerPaidCents(admin, input.orderId);
  if (paid === null) {
    // Unknown is not zero: never void an order whose money cannot be read.
    out.ok = false;
    return out;
  }
  out.paidCents = paid;
  if (paid > 0) out.needsManualRefund = true;
  if (paid > 0 || out.paymentInFlight) return out;

  const { data: voided, error: voidErr } = await admin
    .from("orders")
    .update({ status: "cancelled" })
    .eq("id", input.orderId)
    .eq("tenant_id", input.tenantId)
    .in("status", [...VOIDABLE_ORDER_STATUSES])
    .select("id");
  if (voidErr) {
    logServerError("agenda.cancelMoney.voidOrder", voidErr);
    out.ok = false;
    return out;
  }
  out.orderVoided = Array.isArray(voided) && voided.length > 0;
  return out;
}
