/**
 * Which "confirm booking and request payment" control a solo talent sees on an
 * accepted offer. PURE, no I/O: the server loader gathers the facts (verified
 * owner, newest offer status, booking, payment card) and this table decides.
 *
 *   hidden         not her sale, offer not accepted, or someone else's booking
 *   ready          accepted, no booking yet: one button
 *   retry_payment  booking exists, payment request does not: retry the payment part
 *   done           booking exists and the payment request (or pay in person) is out
 *
 * A booking made by another path (admin / coordinator, no order behind it) is
 * `foreign`: that path owns the payment, so this control stays hidden and can
 * never open a second payment request beside it.
 */

export type ConfirmBookingState = "hidden" | "ready" | "retry_payment" | "done";

export type ConfirmBookingFacts = {
  /** Server-verified: the signed-in talent is on this thread AND it is her own (hub) sale. */
  readonly ownerSeller: boolean;
  /** Status of the newest offer on the inquiry, null when there is none. */
  readonly offerStatus: string | null;
  /** `ours` = booking behind an order this flow made; `foreign` = a booking with no order. */
  readonly booking: "none" | "ours" | "foreign";
  /** A payment_request card (or the pay-in-person confirmation) exists for the offer. */
  readonly paymentRequested: boolean;
};

export function decideConfirmBookingState(f: ConfirmBookingFacts): ConfirmBookingState {
  if (!f.ownerSeller) return "hidden";
  if (f.booking === "foreign") return "hidden";
  const accepted = f.offerStatus === "accepted";
  if (f.booking === "ours") {
    // The engine may stamp the offer `booked` once converted; both read as converted here.
    if (!accepted && f.offerStatus !== "booked") return "hidden";
    return f.paymentRequested ? "done" : "retry_payment";
  }
  return accepted ? "ready" : "hidden";
}
