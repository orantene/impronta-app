/**
 * WSF B2: ONE label set for how clients buy a service, shared by the Services
 * editor and Website settings so both screens name a mode the same way.
 * English keys; each screen translates through its own ES map (the Services
 * editor through the global dashboard map, Website settings through its lazy
 * map, which falls back to the global one).
 *
 * "quote" is not a booking mode in the store: it is `priceDisplay: "quote"`
 * with request booking. It is listed here only so its label matches.
 */

export type BookingModeChoice = "instant" | "request" | "inquiry" | "quote";

export const BOOKING_MODE_LABELS: Record<BookingModeChoice, { title: string; sub: string }> = {
  instant: { title: "Instant booking", sub: "They pick a free time and it is booked" },
  request: { title: "Request to book", sub: "You approve before anything is held" },
  inquiry: { title: "Inquiry only", sub: "They message you first, nothing is booked" },
  quote: { title: "Request a quote", sub: "You agree the amount with each client" },
};

export const BOOKING_MODE_CHOICES: readonly BookingModeChoice[] = ["instant", "request", "inquiry", "quote"];

/** Which choice a service shows: a quote price wins over its booking mode. */
export function bookingChoiceOf(priceDisplay: string | null | undefined, effectiveMode: "instant" | "request" | "inquiry"): BookingModeChoice {
  return priceDisplay === "quote" ? "quote" : effectiveMode;
}
