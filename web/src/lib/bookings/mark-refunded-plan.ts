/**
 * Pure planner for `markRefunded` linked-row booking.
 *
 * Stripe `charge.amount_refunded` is cumulative. A partial refund books a linked
 * `booking_transactions` row via `recordPartialRefund` while the parent stays
 * `paid`. When the remainder brings the cumulative total to full, the webhook
 * calls `markRefunded` — which must book only the REMAINING cents (or flip the
 * parent when partials already cover the gross), never refuse because "a linked
 * refund already exists."
 *
 * That refuse left Story 3 organic prove stuck: $4 partial row booked, $14
 * remainder refused, parent stayed `paid`, five-way UI never flipped.
 */

export type MarkRefundedLinkedPlan = {
  alreadyRefundedCents: number;
  remainingCents: number;
  /** Cents for a new linked refund row; 0 means flip parent only (no insert). */
  insertAmountCents: number;
};

export function planMarkRefundedLinkedRow(input: {
  parentGrossCents: number;
  existingLinkedRefundGrossCents: number[];
  /** THIS refund event's own slice when known (Stripe Refund.amount). */
  refundAmountCents?: number | null;
}): MarkRefundedLinkedPlan {
  const alreadyRefundedCents = input.existingLinkedRefundGrossCents.reduce(
    (sum, n) => sum + Math.max(0, Number(n) || 0),
    0,
  );
  const remainingCents = Math.max(0, input.parentGrossCents - alreadyRefundedCents);
  if (remainingCents <= 0) {
    return { alreadyRefundedCents, remainingCents: 0, insertAmountCents: 0 };
  }
  const slice = input.refundAmountCents;
  const insertAmountCents =
    slice != null && slice > 0 ? Math.min(slice, remainingCents) : remainingCents;
  return { alreadyRefundedCents, remainingCents, insertAmountCents };
}
