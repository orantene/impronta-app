import "server-only";

import { dispatchEventNotifications } from "@/lib/notifications/dispatcher";
import { logServerError } from "@/lib/server/safe-error";

/**
 * Emit `booking.cancelled` (spec §6.4) when a workspace cancels a booking. The
 * three catalog entries (`booking.cancelled.{client,talent,coordinator}`) fan
 * the event out to the client, every booked talent, and the assigned
 * coordinator — each on their own surface, email + in-app.
 *
 * Dispatched directly from the pipeline cancel action (NOT through the engine's
 * `notifyUsers`), so the entries own both channels with no double-notify.
 * `inquiryId` is required — `loadInquiryView` hydrates contact + schedule from
 * it, and `allRosterTalent` resolves the booked talent through it; callers
 * should only invoke this when the booking has a `source_inquiry_id`.
 *
 * Fire-and-forget: the dispatcher no-ops without RESEND_API_KEY and the stable
 * `eventId` (`booking-cancelled:<bookingId>`) dedupes a retried cancel.
 */
export function notifyBookingCancelled(params: {
  tenantId: string;
  inquiryId: string;
  bookingId: string;
}): void {
  void dispatchEventNotifications({
    type: "booking.cancelled",
    tenantId: params.tenantId,
    inquiryId: params.inquiryId,
    bookingId: params.bookingId,
    eventId: `booking-cancelled:${params.bookingId}`,
    payload: { bookingId: params.bookingId },
  }).catch((err) => {
    logServerError("notifyBookingCancelled", err);
  });
}
