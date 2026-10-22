import "server-only";

import { dispatchEventNotifications } from "@/lib/notifications/dispatcher";
import { logServerError } from "@/lib/server/safe-error";
import { afterResponse } from "@/lib/server/after-response";
import type { NotificationEvent } from "@/lib/notifications/types";

export type BookingReservedParams = {
  tenantId: string;
  /** Null for a booking with no source inquiry (recipients come from the booking). */
  inquiryId: string | null;
  bookingId: string;
  /** The deposit just paid, as stored on the transaction. Display only. */
  depositCents: number;
  /** What the deposit credited to the order, without the card fee. The balance is total minus this. */
  principalCents?: number | null;
  currency: string | null;
};

/** `booking.reserved` (a DEPOSIT was paid). Distinct from `booking-confirmed:<id>`, which the balance sends. */
export function buildBookingReservedEvent(p: BookingReservedParams): NotificationEvent {
  return {
    type: "booking.reserved",
    tenantId: p.tenantId,
    inquiryId: p.inquiryId,
    bookingId: p.bookingId,
    eventId: `booking-reserved:${p.bookingId}`,
    payload: { bookingId: p.bookingId, depositCents: p.depositCents, principalCents: p.principalCents ?? null, currency: p.currency },
  };
}

export function notifyBookingReserved(params: BookingReservedParams): void {
  afterResponse(() =>
    dispatchEventNotifications(buildBookingReservedEvent(params)).catch((err) => {
      logServerError("notifyBookingReserved", err);
    }),
  );
}
