/**
 * "From $850" / "Desde $850" — the card + list-row starting-price line.
 *
 * Extracted from DirectoryCardAdapter so the grid and the list view render
 * the identical string; a second copy would inevitably drift (they already
 * had different capabilities before list-view parity).
 *
 * Whole-currency, no decimals: offering amounts are stored in cents and
 * sub-unit starting prices don't exist in practice, so decimals are clutter
 * on a card. Falls back to a bare `$N` when the currency code is one Intl
 * rejects — a bad code must never throw inside render.
 */
export function formatPriceFromLabel(
  amountCents: number,
  currency: string,
  locale: string,
): string {
  let amount: string;
  try {
    amount = new Intl.NumberFormat(locale === "es" ? "es-MX" : "en-US", {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    }).format(Math.round(amountCents / 100));
  } catch {
    amount = `$${Math.round(amountCents / 100)}`;
  }
  return locale === "es" ? `Desde ${amount}` : `From ${amount}`;
}

/**
 * Rate-unit suffix for a "From $X" line: "/ day", "/ hour", "/ half day",
 * "/ week". Only time-based offering price types get one; event, per-person
 * and package prices are not rates and read wrong with a unit.
 */
export function formatPriceUnitSuffix(
  priceType: string | null | undefined,
  locale: string,
): string | null {
  const es = locale === "es";
  switch (priceType) {
    case "hour":
      return es ? "/ hora" : "/ hour";
    case "day":
      return es ? "/ día" : "/ day";
    case "half_day":
      return es ? "/ medio día" : "/ half day";
    case "week":
      return es ? "/ semana" : "/ week";
    default:
      return null;
  }
}
