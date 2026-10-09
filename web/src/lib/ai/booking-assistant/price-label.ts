/**
 * Catalog price string for the booking-assistant grounding JSON.
 * Uses the shared offerings money formatter + guest locale (DS-17).
 */

import { formatMoney } from "@/lib/talent/offerings-money";

export function offeringPriceLabel(
  amountCents: number | null,
  currency: string,
  visibility: string,
  locale: string,
): string | null {
  if (visibility === "on_request") return null;
  if (amountCents == null || !Number.isFinite(amountCents) || amountCents <= 0) return null;
  return formatMoney(amountCents, currency, locale);
}
