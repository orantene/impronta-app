/**
 * Build the calendared event for a paid, dated booking on the pay return page
 * (TUL-437). Pure: the page loads the booking rows; this turns them into one
 * CalendarEvent or null when there is no start time.
 */

import { pickEventLocation } from "@/lib/scheduling/booking-event-location";

import type { CalendarEvent } from "./calendar-links";

const FALLBACK_DURATION_MS = 60 * 60 * 1000;

export type PayCalendarBooking = {
  /** Stable uid stem (booking id or order id). */
  uid: string;
  startsAt: string | null | undefined;
  endsAt?: string | null;
  title?: string | null;
  locationText?: string | null;
  requestedLocation?: string | null;
  venueLocationText?: string | null;
  sellerName?: string | null;
  /** Already-localised "Paid to {seller}" / description line. */
  description?: string | null;
};

/** null when there is no usable start instant. */
export function payCalendarEvent(input: PayCalendarBooking): CalendarEvent | null {
  const startsAt = typeof input.startsAt === "string" ? input.startsAt.trim() : "";
  if (!startsAt || !Number.isFinite(Date.parse(startsAt))) return null;
  const endRaw = typeof input.endsAt === "string" ? input.endsAt.trim() : "";
  const endsAt =
    endRaw && Date.parse(endRaw) > Date.parse(startsAt)
      ? endRaw
      : new Date(Date.parse(startsAt) + FALLBACK_DURATION_MS).toISOString();
  const title = (input.title?.trim() || "Booking").slice(0, 200);
  const withSeller =
    input.sellerName?.trim() && !title.toLowerCase().includes(input.sellerName.trim().toLowerCase())
      ? `${title}, ${input.sellerName.trim()}`
      : title;
  const location = pickEventLocation({
    bookingLocationText: input.locationText,
    requested: input.requestedLocation,
    fromSettings: input.venueLocationText,
  });
  return {
    uid: input.uid,
    title: withSeller,
    startsAt,
    endsAt,
    location,
    description: input.description?.trim() || null,
  };
}
