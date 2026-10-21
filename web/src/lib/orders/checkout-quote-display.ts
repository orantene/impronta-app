/**
 * Display-only helpers for the booking sheet's card-fee line (TUL-1268 item 5).
 * Pure: reads a quote, never feeds a charge. The amounts come from `quoteCheckoutCollect`,
 * which calls the same `resolveCheckoutCollectCents` Checkout uses.
 */

export type CheckoutQuote = {
  /** What the order is credited (deposit or full), before any card fee. */
  principalCents: number;
  /** What Checkout collects. */
  collectCents: number;
  /** collect - principal; 0 unless the platform runs pass-through and the buyer pays by card. */
  cardFeeCents: number;
  currency: string;
  /** E5 (TUL-1270 M2): the talent's travel fee for a home visit, paid on the day. Never in collectCents. */
  travelFeeOnDayCents?: number;
};

/** null when there is no fee to show, so the sheet renders exactly as before. */
export function cardFeeSummary(
  quote: CheckoutQuote | null | undefined,
): { principalCents: number; feeCents: number; payNowCents: number; currency: string; travelFeeOnDayCents: number } | null {
  const travelFeeOnDayCents = quote && (quote.travelFeeOnDayCents ?? 0) > 0 ? (quote.travelFeeOnDayCents as number) : 0;
  if (!quote || !(quote.cardFeeCents > 0 || travelFeeOnDayCents > 0)) return null;
  return {
    principalCents: quote.principalCents,
    feeCents: Math.max(0, quote.cardFeeCents),
    payNowCents: quote.collectCents,
    currency: quote.currency,
    travelFeeOnDayCents,
  };
}

export function cardFeeCopy(es: boolean): { fee: string; payNow: string; travelOnDay: string } {
  return es
    ? { fee: "Comisión de tarjeta", payNow: "Pagas ahora", travelOnDay: "Traslado, se paga el día de la cita" }
    : { fee: "Card processing fee", payNow: "You pay now", travelOnDay: "Travel fee, paid on the day" };
}
