/**
 * "desde $850 MXN" / "from $850 MXN" — the card + list-row starting-price line.
 *
 * TUL-516: delegates to the shared public formatter so directory cards match
 * talent-site menus (never bare `$850` or Intl `MX$850`).
 */
import { formatPublicFromMoney, formatPublicMoney } from "@/lib/talent/public-price-format";

export function formatPriceFromLabel(
  amountCents: number,
  currency: string,
  locale: string,
): string {
  if (!Number.isFinite(amountCents) || amountCents <= 0) {
    return locale === "es" || locale.toLowerCase().startsWith("es") ? "Consultar" : "Ask";
  }
  return formatPublicFromMoney(amountCents, currency, locale);
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

/** Exact (non-from) directory amount — same `$N CODE` shape. */
export function formatPriceExactLabel(
  amountCents: number,
  currency: string,
  locale: string,
): string {
  return formatPublicMoney(amountCents, currency, locale);
}
