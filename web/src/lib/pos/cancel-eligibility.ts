/**
 * PM 2026-10-21: an editor-level cashier (`operate_venue`) may cancel a sale ONLY when it is an
 * unpaid draft: status `draft`, no money collected and none in flight. Anything else (a
 * `pending_payment` sale with a reservation bound, or any paid / partly paid sale) stays with
 * `booking.payment.request` (manager and above).
 *
 * Pure: the caller reads the order status and its payment rows. Unknown payment statuses count
 * as money in flight, so a new status can only make this stricter.
 */
const DEAD_PAYMENT_STATUSES: ReadonlySet<string> = new Set(["failed", "cancelled", "canceled", "expired", "void", "voided"]);

export function cashierMayCancelSale(input: {
  status: string | null | undefined;
  payments: ReadonlyArray<{ status: string | null | undefined }>;
}): boolean {
  if (input.status !== "draft") return false;
  return input.payments.every((p) => typeof p.status === "string" && DEAD_PAYMENT_STATUSES.has(p.status));
}
