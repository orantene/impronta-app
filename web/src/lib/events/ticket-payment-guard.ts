/**
 * ticket-payment-guard.ts — may this ticket order start a card payment?
 *
 * TUL-1268 M2. `startTicketCardPayment` opened a Stripe Checkout session from
 * the order and transaction ids alone. A second tab, a back button or a replayed
 * request on an order that was already paid (or cancelled) opened a NEW session
 * and could take a second charge for the same tickets. This is the check it
 * makes first: a paid or settled order refuses, a cancelled or failed one
 * refuses, and anything it does not recognise refuses (fail closed).
 *
 * PURE: statuses in, a refusal or null out.
 */

export type TicketPaymentRefusal = "already_paid" | "not_payable";

/** Order statuses a guest card payment may start from (`public.order_status`). */
const PAYABLE_ORDER = new Set(["draft", "quoted", "pending_payment"]);
const PAID_ORDER = new Set(["paid", "fulfilled", "partially_refunded", "refunded"]);

/** Transaction statuses still waiting for the guest's money. */
const PAYABLE_TXN = new Set(["draft", "payment_requested", "pending"]);
/** Money already taken on this row (disputed means it was taken and contested). */
const PAID_TXN = new Set(["paid", "payout_pending", "payout_sent", "disputed"]);

export function ticketCardPaymentRefusal(
  orderStatus: string | null | undefined,
  transactionStatus: string | null | undefined,
): TicketPaymentRefusal | null {
  const order = orderStatus ?? "";
  const txn = transactionStatus ?? "";
  if (PAID_ORDER.has(order) || PAID_TXN.has(txn)) return "already_paid";
  if (!PAYABLE_ORDER.has(order) || !PAYABLE_TXN.has(txn)) return "not_payable";
  return null;
}
