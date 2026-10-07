import "server-only";

import { dispatchEventNotifications } from "@/lib/notifications/dispatcher";
import type { DispatchResult } from "@/lib/notifications/types";

/**
 * Emit `booking.day_of_reminder` (spec §6.4) — a heads-up that a confirmed
 * booking is happening tomorrow. The two catalog entries
 * (`booking.day_of_reminder.{client,talent}`) fan the event out to the client
 * (or guest contact) and every booked talent, each on their own surface,
 * email + in-app.
 *
 * Dispatched directly from the `booking-reminders` cron (NOT through the
 * engine's `notifyUsers`), so the entries own both channels with no
 * double-notify. `inquiryId` is required — `loadInquiryView` hydrates schedule
 * + location from it, and `allRosterTalent` resolves the booked talent through
 * it; the cron only invokes this for bookings carrying a `source_inquiry_id`.
 *
 * The stable `eventId` (`booking-reminder:<bookingId>`) makes a re-run idempotent:
 * the dispatch_log unique index collapses a duplicate `(event, recipient,
 * channel)` to a no-op, so a booking whose `event_date` straddles two cron runs
 * is only reminded once. Returns the `DispatchResult` so the cron can sum
 * per-booking counts for its summary line.
 */
export function notifyBookingDayOfReminder(params: {
  tenantId: string;
  inquiryId: string;
  bookingId: string;
}): Promise<DispatchResult> {
  return dispatchEventNotifications({
    type: "booking.day_of_reminder",
    tenantId: params.tenantId,
    inquiryId: params.inquiryId,
    bookingId: params.bookingId,
    eventId: `booking-reminder:${params.bookingId}`,
    payload: { bookingId: params.bookingId },
  });
}

/**
 * Day-of reminder for a talent-site guest appointment (`talent_bookings`,
 * TUL-108). Same event + catalog entries as the agency sweep, so the guest and
 * the booked talent get the same email + bell. The eventId prefix is DISTINCT
 * (`talent-booking-reminder:`) so a talent booking id can never collide with an
 * `agency_bookings` id in `notification_dispatch_log_dedupe_uq`.
 */
export function notifyTalentBookingDayOfReminder(params: {
  tenantId: string;
  inquiryId: string;
  talentBookingId: string;
}): Promise<DispatchResult> {
  return dispatchEventNotifications({
    type: "booking.day_of_reminder",
    tenantId: params.tenantId,
    inquiryId: params.inquiryId,
    eventId: `talent-booking-reminder:${params.talentBookingId}`,
    payload: { talentBookingId: params.talentBookingId },
  });
}
