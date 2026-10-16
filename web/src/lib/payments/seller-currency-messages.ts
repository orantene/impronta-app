/**
 * seller-currency-messages.ts - TUL-704. The wording a paying client reads when
 * the currency guard refuses a charge. Plain language in the client's own
 * language, no Stripe or engineering phrasing. The guard still returns a stable
 * `code`; only the sentence follows the locale.
 */
export type ChargeRefusalKind = "no_currency" | "not_priced" | "lane";

export function chargeRefusalMessage(
  kind: ChargeRefusalKind,
  locale: string | null | undefined,
  facts: { charge?: string; priced?: string } = {},
): string {
  const es = (locale ?? "").slice(0, 2).toLowerCase() === "es";
  const charge = facts.charge ?? "";
  const priced = facts.priced ?? "";
  if (kind === "no_currency") {
    return es
      ? "Este pago no tiene una moneda válida, así que no se puede cobrar."
      : "This payment has no valid currency, so it can't be charged.";
  }
  if (kind === "not_priced") {
    return es
      ? `Este pago está en ${charge} pero el precio está en ${priced}. Hay que corregir la moneda antes de cobrar.`
      : `This payment is in ${charge} but the price is in ${priced}. The currency has to match before it can be charged.`;
  }
  return es
    ? `Esta cuenta no puede cobrar en ${charge} por ahora. Escribe a la persona que te atiende para resolverlo.`
    : `This account can't take ${charge} payments right now. Message the person you're booking to sort it out.`;
}
