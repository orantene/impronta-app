/**
 * The US-dollar equivalent printed beside a price in another currency
 * (owner ruling 2026-09-23: talents may price in MXN; the client also sees
 * what that is in dollars).
 *
 * Pure and directive-free, so the server storefront, the client islands and
 * the talent editor all compute the same figure from the same rates.
 *
 * It REFUSES rather than guesses. No rates, an unknown currency, a zero or
 * missing amount, or a price that is already in dollars all return null, and
 * the caller prints nothing. A missing "≈ US$" line is honest; a made-up one
 * is a price the client may hold us to.
 *
 * Rates are "units of the currency per 1 USD" (the Frankfurter/ECB shape with
 * base=USD), so 950 MXN at 18.5 MXN per USD is 950 / 18.5 = US$51.35.
 *
 * DISPLAY ONLY. This figure is a reference for the client. It is not the
 * amount any checkout charges; checkout charges the order in the order's own
 * currency until a locked-rate conversion ships.
 */

export type UsdRates = {
  /** The day the rates are valid for (ISO date), shown in tooltips. */
  rateDate: string;
  /** Currency code → units of that currency per 1 USD. */
  perUsd: Record<string, number>;
};

/** The USD cents a foreign amount is worth, or null when it cannot be said. */
export function usdEquivalentCents(
  amountCents: number | null | undefined,
  currency: string | null | undefined,
  fx: UsdRates | null | undefined,
): number | null {
  if (amountCents == null || !Number.isFinite(amountCents) || amountCents <= 0) return null;
  const cur = (currency ?? "").trim().toUpperCase();
  if (!cur || cur === "USD" || !fx) return null;
  const rate = fx.perUsd[cur];
  if (typeof rate !== "number" || !Number.isFinite(rate) || rate <= 0) return null;
  const cents = Math.round(amountCents / rate);
  return cents > 0 ? cents : null;
}

/**
 * "≈ US$51" for amounts of ten dollars or more, "≈ US$2.70" below that, where
 * rounding away the cents would visibly change the figure.
 */
export function formatUsdEquivalent(usdCents: number, locale: string): string {
  const dollars = usdCents / 100;
  const whole = dollars >= 10;
  const shown = new Intl.NumberFormat(locale.toLowerCase().startsWith("es") ? "es-US" : "en-US", {
    minimumFractionDigits: whole ? 0 : 2,
    maximumFractionDigits: whole ? 0 : 2,
  }).format(whole ? Math.round(dollars) : dollars);
  return `≈ US$${shown}`;
}

/** The whole line, or null when there is nothing honest to print. */
export function usdEquivalentLabel(
  amountCents: number | null | undefined,
  currency: string | null | undefined,
  fx: UsdRates | null | undefined,
  locale: string,
): string | null {
  const cents = usdEquivalentCents(amountCents, currency, fx);
  return cents == null ? null : formatUsdEquivalent(cents, locale);
}

/** Whether any item is priced outside USD, so a page only loads rates when it needs them. */
export function needsUsdRates(items: ReadonlyArray<{ currency?: string | null; amountCents?: number | null }>): boolean {
  return items.some((i) => (i.amountCents ?? 0) > 0 && (i.currency ?? "USD").trim().toUpperCase() !== "USD");
}
