/**
 * The guest's notes and phone for the booking email to the Talent/Profesional.
 * Notes are visitor text: control characters are stripped and the text is cut to
 * 500 characters here; React Email escapes it when rendering.
 */
import { normalizeGuestPhone } from "@/lib/phone/guest-phone";

export const BOOKING_EMAIL_NOTE_MAX = 500;

export function bookingEmailGuestDetails(input: {
  message?: unknown;
  phone?: unknown;
}): { guestNote: string | null; guestPhone: string | null } {
  const rawNote = typeof input.message === "string" ? input.message : "";
  const note = Array.from(rawNote)
    .filter((ch) => {
      const c = ch.charCodeAt(0);
      return ch === "\n" || ch === "\t" || (c >= 32 && c !== 127);
    })
    .join("")
    .trim()
    .slice(0, BOOKING_EMAIL_NOTE_MAX)
    .trim();
  const rawPhone = typeof input.phone === "string" ? input.phone.trim() : "";
  return {
    guestNote: note || null,
    guestPhone: rawPhone ? (normalizeGuestPhone(rawPhone) ?? rawPhone.slice(0, 40)) : null,
  };
}
