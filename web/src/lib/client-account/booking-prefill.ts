/**
 * Booking form prefill for a signed-in client (TUL-723). Pure rules only.
 *
 * Contact details come from the signed-in client's own account, fetched
 * server-side per request. Never from shared storage or URLs (TUL-705), and
 * never for staff or talent sessions.
 */

import { isClientAccountEligible } from "./pure";

export type BookingPrefill = { name: string; email: string; phone: string };

export type BookingPrefillSource = {
  appRole: string | null | undefined;
  displayName: string | null | undefined;
  email: string | null | undefined;
  phone: string | null | undefined;
};

const clean = (v: string | null | undefined) => (typeof v === "string" ? v.trim() : "");

/** The client's own details, or null for any non-client session. */
export function bookingPrefillFor(src: BookingPrefillSource): BookingPrefill | null {
  if (!isClientAccountEligible(src.appRole)) return null;
  const out = { name: clean(src.displayName), email: clean(src.email), phone: clean(src.phone) };
  return out.name || out.email || out.phone ? out : null;
}

/** Fill only fields the visitor has not typed into; every field stays editable. */
export function applyBookingPrefill(current: BookingPrefill, prefill: BookingPrefill | null): BookingPrefill {
  if (!prefill) return current;
  return {
    name: current.name.trim() ? current.name : prefill.name,
    email: current.email.trim() ? current.email : prefill.email,
    phone: current.phone.trim() ? current.phone : prefill.phone,
  };
}
