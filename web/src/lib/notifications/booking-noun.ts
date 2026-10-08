/**
 * TUL-136: which word a guest-facing booking email uses for the thing that is
 * happening. Agency bookings are events ("Your event is tomorrow"); a booking
 * made on a talent's own site is an appointment ("Your appointment is
 * tomorrow", "Tu cita es mañana").
 *
 * The signal is the event payload. The talent-site reminder producer
 * (`notifyTalentBookingDayOfReminder`) always sets `talentBookingId` and the
 * `appointment*` fields; the agency sweep sets neither. No trade or category is
 * on the payload at email-build time, so this is keyed on the booking SOURCE,
 * not the trade. A producer that knows better (an event talent such as a DJ)
 * can set `bookingKind: "event"` to keep the event wording.
 *
 * Pure: no I/O, safe to import from templates and the email channel.
 */

export type BookingNoun = "appointment" | "event";

export function bookingNoun(payload: Record<string, unknown> | null | undefined): BookingNoun {
  const p = payload ?? {};
  if (p.bookingKind === "event") return "event";
  if (p.bookingKind === "appointment") return "appointment";
  const has = (k: string) => typeof p[k] === "string" && (p[k] as string).trim() !== "";
  return has("talentBookingId") || has("appointmentStartsAt") ? "appointment" : "event";
}
