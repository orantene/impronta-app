/**
 * line-item-name.ts — what the payer reads as the Stripe line item.
 * "<service name> · deposit" / "<service name> · full payment" (EN/ES by the
 * payer's locale) instead of a bare "Payment". Pure.
 */

export type PaymentPortion = "deposit" | "full";

/** Deposit when the link collects less than the order total. */
export function paymentPortion(amountCents: number, orderTotalCents: number | null | undefined): PaymentPortion {
  const total = Number(orderTotalCents);
  if (!Number.isFinite(total) || total <= 0) return "full";
  return amountCents < total ? "deposit" : "full";
}

export function paymentLineItemName(input: {
  serviceName: string | null | undefined;
  portion: PaymentPortion;
  locale?: string | null;
}): string {
  const es = (input.locale ?? "").toLowerCase().startsWith("es");
  const portion =
    input.portion === "deposit" ? (es ? "anticipo" : "deposit") : es ? "pago completo" : "full payment";
  const service = (input.serviceName ?? "").trim();
  if (!service) return es ? `Pago · ${portion}` : `Payment · ${portion}`;
  return `${service} · ${portion}`;
}

/**
 * The fee lines a payer reads next to the service on Stripe Checkout, in the
 * same words as the pay page's fee breakdown (`public.thread.fees.*` and the
 * quote's "Tulala service fee"), EN/ES by the payer's locale.
 */
export function feeLineItemName(kind: "service" | "processing", locale?: string | null): string {
  const es = (locale ?? "").toLowerCase().startsWith("es");
  if (kind === "service") return es ? "Cargo por servicio de Tulala" : "Tulala service fee";
  return es ? "Procesamiento de tarjeta" : "Card processing";
}
