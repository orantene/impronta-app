/**
 * TUL-633: the per-service "Fixed price | Get a quote" switch on the Services dashboard, pure.
 * Built on the existing model: a quote service is `priceDisplay: "quote"` with request booking, and
 * its public button is "Request a quote" (resolveOfferingCta -> ask_quote). No new field.
 */
import type { TalentOffering } from "@/lib/talent/offerings-types";

type Mode = Pick<TalentOffering, "priceDisplay" | "bookingMode">;

export const isQuoteService = (o: Pick<TalentOffering, "priceDisplay">): boolean => o.priceDisplay === "quote";

/** Switch to "Get a quote": request booking, no slots. */
export function toQuoteMode(): Mode {
  return { priceDisplay: "quote", bookingMode: "request" };
}

/** Switch back to "Fixed price": follows the talent's default booking mode again; the amount is typed next. */
export function toFixedMode(): Mode {
  return { priceDisplay: "exact", bookingMode: null };
}

/** The dashboard reminder: a live quote service takes requests, not bookings, until it has a price. */
export function quoteNeedsPriceReminder(o: Pick<TalentOffering, "status" | "priceDisplay">): boolean {
  return o.priceDisplay === "quote" && o.status === "published";
}
