/**
 * Display helpers over a quoted breakdown (TUL-1298). Pure and client-safe: they read what
 * `quoteSelectionAction` returned and never compute a price of their own.
 */
import type { PriceBreakdown } from "./types";

export type SelectionSummary = {
  currency: string;
  /** Promo-adjusted order total: what the guest is buying for. */
  totalCents: number;
  discountCents: number;
  /** The pass-through card fee on top of the principal; 0 unless armed. */
  feeCents: number;
  /** What Stripe charges now (principal + fee). */
  payNowCents: number;
  /** What is still owed after the principal (the deposit case). */
  balanceCents: number;
  travelFeeOnDayCents: number;
  /** True when "you pay now" differs from the total line, so the row earns its place. */
  showPayNow: boolean;
};

export function selectionSummary(b: Pick<PriceBreakdown, "currency" | "totalCents" | "discountCents" | "collectCents" | "cardFeeCents" | "principalCents" | "balanceCents" | "travelFeeOnDayCents">): SelectionSummary {
  const feeCents = Math.max(0, b.cardFeeCents);
  return {
    currency: b.currency,
    totalCents: b.totalCents,
    discountCents: b.discountCents,
    feeCents,
    payNowCents: b.collectCents,
    balanceCents: b.balanceCents,
    travelFeeOnDayCents: Math.max(0, b.travelFeeOnDayCents),
    showPayNow: feeCents > 0 || b.principalCents < b.totalCents,
  };
}

export function selectionCopy(es: boolean): { discount: string; balance: string; fee: string; payNow: string; travelOnDay: string } {
  return es
    ? { discount: "Descuento", balance: "Saldo pendiente", fee: "Comisión de tarjeta", payNow: "Pagas ahora", travelOnDay: "Traslado, se paga el día de la cita" }
    : { discount: "Discount", balance: "Balance due later", fee: "Card processing fee", payNow: "You pay now", travelOnDay: "Travel fee, paid on the day" };
}
