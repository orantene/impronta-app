/**
 * TUL-633: the per-service "Fixed price | Get a quote" switch on the Services dashboard, pure.
 * Built on the existing model: a quote service is `priceDisplay: "quote"` with request booking, and
 * its public button is "Request a quote" (resolveOfferingCta -> ask_quote). No new field.
 */
import type { TalentOffering } from "@/lib/talent/offerings-types";

type Mode = Pick<TalentOffering, "priceDisplay" | "bookingMode">;
type PriceType = TalentOffering["priceType"];

/**
 * Main's rule (#3657): a quote service stores `priceType: "custom"`; leaving quote must put a
 * non-custom type back, or the service stays "custom" with a fixed price.
 */
export const leaveCustomPriceType = (current: PriceType | undefined): { priceType?: PriceType } =>
  current === "custom" ? { priceType: "flat_package" } : {};

export const isQuoteService = (o: Pick<TalentOffering, "priceDisplay">): boolean => o.priceDisplay === "quote";

/** Switch to "Get a quote": request booking, no slots, and no stored amount (main's #3657 behavior). */
export function toQuoteMode(): Mode & { amountCents: null } {
  return { priceDisplay: "quote", bookingMode: "request", amountCents: null };
}

/** Switch back to "Fixed price": follows the talent's default booking mode again; the amount is typed next. */
export function toFixedMode(current?: PriceType): Mode & { priceType?: PriceType } {
  return { priceDisplay: "exact", bookingMode: null, ...leaveCustomPriceType(current) };
}

/** The dashboard reminder: a live quote service takes requests, not bookings, until it has a price. */
export function quoteNeedsPriceReminder(o: Pick<TalentOffering, "status" | "priceDisplay">): boolean {
  return o.priceDisplay === "quote" && o.status === "published";
}
