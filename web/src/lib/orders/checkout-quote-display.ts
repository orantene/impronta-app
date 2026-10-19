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
};

/** null when there is no fee to show, so the sheet renders exactly as before. */
export function cardFeeSummary(
  quote: CheckoutQuote | null | undefined,
): { principalCents: number; feeCents: number; payNowCents: number; currency: string } | null {
  if (!quote || !(quote.cardFeeCents > 0)) return null;
  return { principalCents: quote.principalCents, feeCents: quote.cardFeeCents, payNowCents: quote.collectCents, currency: quote.currency };
}

export function cardFeeCopy(es: boolean): { fee: string; payNow: string } {
  return es ? { fee: "Comisión de tarjeta", payNow: "Pagas ahora" } : { fee: "Card processing fee", payNow: "You pay now" };
}
