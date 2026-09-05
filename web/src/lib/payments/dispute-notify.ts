import "server-only";

import { dispatchEventNotifications } from "@/lib/notifications/dispatcher";

/**
 * Alert on a chargeback that is NOT tied to a booking.
 *
 * `handleBookingDispute` returns false for a subscription invoice or a balance
 * top-up, and that branch used to do nothing but write a log line. So the
 * booking lane rang a bell while the lane most likely to produce the FIRST real
 * chargeback -- a subscription card -- was completely silent.
 *
 * Same event type as the booking lane, so it reaches the same catalog entry and
 * the same platform admins. `bookingId` is absent by definition.
 *
 * Extracted from the webhook handler rather than inlined, because that file sits
 * against its 800-line lint cap and absorbing the cap would have been the wrong
 * way to pay for this.
 */
export async function notifyNonBookingDispute(input: {
  disputeId: string;
  /** The action's own field name, so the caller can pass it straight through
   *  rather than restating six fields at a call site that has no headroom. */
  amount: number;
  currency: string;
  reason: string;
  closed: boolean;
  evidenceDueBy: number | null;
}): Promise<void> {
  // Only the OPENING of a dispute is an alert. A close is recorded elsewhere
  // and does not carry a deadline anyone must act on.
  if (input.closed) return;

  // Never let a notification failure change the webhook's outcome: Stripe must
  // still get its 200, or it retries a dispute we have already recorded.
  await dispatchEventNotifications({
    type: "payment.dispute.opened",
    tenantId: null,
    eventId: `dispute-opened-${input.disputeId}`,
    payload: {
      amountCents: input.amount,
      currency: input.currency,
      reason: input.reason,
      disputeId: input.disputeId,
      bookingId: null,
      platformFrom: true,
      // ISO so the template renders it without re-deriving a timezone.
      evidenceDueAt:
        input.evidenceDueBy != null ? new Date(input.evidenceDueBy * 1000).toISOString() : null,
    },
  }).catch(() => undefined);
}
