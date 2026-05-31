import "server-only";

import { dispatchEventNotifications } from "@/lib/notifications/dispatcher";
import { logServerError } from "@/lib/server/safe-error";

/**
 * Emit `booking.confirmed` when a booking is PAID (from `markPaid`). The two
 * catalog entries (`booking.confirmed.{client,talent}`) fan the event out to the
 * client + every booked talent — email, on their own surface.
 *
 * This restores the pre-engine behavior of emailing the booking confirmation at
 * PAYMENT time. The conversion-time `booking.created` no longer emails, so a
 * converted-but-unpaid booking sends nothing; the confirmation only goes out
 * once money is collected. The payment receipt (`payment.received`) fires
 * alongside this from the same `markPaid` but on a DISTINCT eventId, so the two
 * never collide on the dispatch_log dedupe key (`eventId:recipient:channel`).
 *
 * Dispatched directly (NOT through the engine's `notifyUsers`), so the entries
 * own the channel with no double-notify. `inquiryId` is required —
 * `loadInquiryView` hydrates contact + schedule from it and `allRosterTalent`
 * resolves the booked talent through it; callers must only invoke this when the
 * booking has a `source_inquiry_id`.
 *
 * Fire-and-forget: the dispatcher no-ops without RESEND_API_KEY and the stable
 * `eventId` (`booking-confirmed:<bookingId>`) collapses a re-paid / re-delivered
 * transaction (and a multi-payment booking) to a single confirmation per booking.
 */
export function notifyBookingConfirmed(params: {
  tenantId: string;
  inquiryId: string;
  bookingId: string;
}): void {
  void dispatchEventNotifications({
    type: "booking.confirmed",
    tenantId: params.tenantId,
    inquiryId: params.inquiryId,
    bookingId: params.bookingId,
    eventId: `booking-confirmed:${params.bookingId}`,
    payload: { bookingId: params.bookingId },
  }).catch((err) => {
    logServerError("notifyBookingConfirmed", err);
  });
}
