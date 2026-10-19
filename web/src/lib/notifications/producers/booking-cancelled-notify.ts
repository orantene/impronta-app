import "server-only";

import { dispatchEventNotifications } from "@/lib/notifications/dispatcher";
import { logServerError } from "@/lib/server/safe-error";
import type { NotificationEvent } from "@/lib/notifications/types";
import { afterResponse } from "@/lib/server/after-response";

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
export type BookingCancelledParams = {
  tenantId: string;
  inquiryId: string;
  bookingId: string;
  /** Display-only extras (paid/refund amounts, who cancelled) merged into the payload. */
  extra?: Record<string, unknown>;
};

/** The one event shape every cancel path dispatches (stable eventId = one notice per booking). */
export function buildBookingCancelledEvent(params: BookingCancelledParams): NotificationEvent {
  return {
    type: "booking.cancelled",
    tenantId: params.tenantId,
    inquiryId: params.inquiryId,
    bookingId: params.bookingId,
    eventId: `booking-cancelled:${params.bookingId}`,
    payload: { ...(params.extra ?? {}), bookingId: params.bookingId },
  };
}

export function notifyBookingCancelled(params: BookingCancelledParams): void {
  afterResponse(() => dispatchEventNotifications(buildBookingCancelledEvent(params)).catch((err) => {
    logServerError("notifyBookingCancelled", err);
  }));
}
