import "server-only";

import { notifyBookingCancelled } from "@/lib/notifications/producers/booking-cancelled-notify";
import { logServerError } from "@/lib/server/safe-error";

/** What the cancel funnel tells the notice. Amounts are display only. */
export type BookingSetCancelledNotice = {
  tenantId: string;
  bookingId: string;
  /** The booking's source inquiry; the notice needs it for contact + roster. */
  inquiryId: string | null;
  /** Sum of paid transactions; null when it could not be read. */
  paidCents: number | null;
  /** Policy refund from `cancelBookingSet`; null when it could not be computed. */
  refundableCents: number | null;
  currency: string | null;
  by: string | null;
};

export type BookingSetCancelNotifier = (notice: BookingSetCancelledNotice) => void;

/**
 * THE one hook behind every cancel entry point (staff desk, /manage token link,
 * /account, talent agenda): `cancelBookingSet` calls it once per accepted
 * cancel. It fans out `booking.cancelled` to the client (client voice), every
 * booked talent and the coordinator, EN + ES by recipient locale.
 *
 * Dedupe: the producer's eventId is `booking-cancelled:<bookingId>`, shared
 * with the pipeline cancel, so a booking notifies once however it is cancelled.
 * Never throws: a notice failure must not undo or hide a cancel.
 */
export const notifyBookingSetCancelled: BookingSetCancelNotifier = (notice) => {
  try {
    if (!notice.inquiryId) {
      // A booking with no source inquiry has no contact/roster to hydrate from.
      logServerError(
        "scheduling.cancelNotify.noInquiry",
        new Error(`booking ${notice.bookingId} has no source inquiry; cancel notice skipped`),
      );
      return;
    }
    notifyBookingCancelled({
      tenantId: notice.tenantId,
      inquiryId: notice.inquiryId,
      bookingId: notice.bookingId,
      extra: {
        paidCents: notice.paidCents,
        refundCents: notice.refundableCents,
        currency: notice.currency,
        cancelledBy: notice.by,
      },
    });
  } catch (err) {
    logServerError("scheduling.cancelNotify", err);
  }
};
