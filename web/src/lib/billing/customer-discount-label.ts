/**
 * TUL-1904: the text Stripe prints on the discount line of an invoice PDF is the
 * coupon's `name`. It must be customer-facing: never the internal admin name or
 * an internal subject label, and never Stripe's raw default ("20.0% off").
 * Pure; no Stripe client.
 */

export type CustomerDiscountKind = "percent" | "fixed" | "free_months";

function isEs(locale: string | null | undefined): boolean {
  return (locale ?? "").toLowerCase().startsWith("es");
}

/** 20 -> "20", 12.5 -> "12.5". Never "20.0". */
export function formatDiscountPercent(value: number): string {
  return String(Number(value.toFixed(2)));
}

export function customerDiscountLabel(input: {
  kind: CustomerDiscountKind;
  value: number;
  currency?: string | null;
  locale?: string | null;
}): string {
  const es = isEs(input.locale);
  if (input.kind === "percent" && input.value > 0 && input.value < 100) {
    const pct = formatDiscountPercent(input.value);
    return es ? `${pct}% de descuento` : `${pct}% off`;
  }
  if (input.kind === "fixed" && input.value > 0 && input.currency) {
    try {
      const money = new Intl.NumberFormat(es ? "es" : "en", {
        style: "currency",
        currency: input.currency.toUpperCase(),
        minimumFractionDigits: Number.isInteger(input.value) ? 0 : 2,
      }).format(input.value);
      return es ? `${money} de descuento` : `${money} off`;
    } catch {
      // unknown currency code: fall through to the plain label
    }
  }
  return es ? "Descuento" : "Discount";
}
