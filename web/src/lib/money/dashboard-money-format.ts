/**
 * ONE money format for the talent dashboard (QA DS-17).
 *
 * RULE: `<symbol><amount> <CODE>`, always, for every currency.
 *   MXN -> "$700 MXN"     USD -> "$700 USD"     EUR -> "€700 EUR"
 * The code is never dropped and never baked into the symbol ("MX$700" and
 * "US$700" are NOT produced), so a Mexico business reads "$700 MXN" on Today,
 * Money, Services and the editor preview alike. The converted hint printed
 * beside a foreign price ("≈ US$17", usd-equivalent.ts) is a separate, secondary
 * string and is untouched.
 *
 * DISPLAY ONLY. This never computes, converts or rounds a stored amount; the
 * caller hands in the major-unit figure it already has. Whole amounts print
 * with no decimals ("$300"), anything with cents keeps two ("$300.50") unless
 * the caller asks for whole units. Grouping follows the dashboard locale and
 * the currency's home market (es + EUR -> "1.200", es + MXN -> "1,200").
 *
 * Pure module: no React, no server code. A bad currency code never throws.
 */
import { moneyLocale } from "@/lib/talent/offerings-money";

export type DashboardMoneyOptions = {
  /** Round to whole units (the earnings tiles never show cents). */
  wholeUnits?: boolean;
};

export function formatDashboardMoney(
  amountMajor: number,
  currency: string | null | undefined,
  locale: string = "en",
  options: DashboardMoneyOptions = {},
): string {
  const code = (currency || "USD").trim().toUpperCase() || "USD";
  const value = options.wholeUnits ? Math.round(amountMajor) : amountMajor;
  const hasCents = !options.wholeUnits && value % 1 !== 0;
  const intlLocale = moneyLocale(code, locale);
  const digits = { minimumFractionDigits: hasCents ? 2 : 0, maximumFractionDigits: hasCents ? 2 : 0 };
  let symbol = "";
  try {
    const parts = new Intl.NumberFormat(intlLocale, {
      style: "currency",
      currency: code,
      currencyDisplay: "narrowSymbol",
      ...digits,
    }).formatToParts(value);
    symbol = parts.find((p) => p.type === "currency")?.value ?? "";
  } catch {
    symbol = "";
  }
  const number = new Intl.NumberFormat(intlLocale, { ...digits, useGrouping: "always" }).format(value);
  // No usable symbol (unknown code, or the symbol IS the code): "100 ZZZ".
  if (!symbol || symbol.toUpperCase() === code) return `${number} ${code}`;
  return `${symbol}${number} ${code}`;
}

/**
 * Same format for an amount held in minor units (cents). Keeps cents when the
 * amount has them ("$300.50 MXN"); display only, nothing is recomputed.
 */
export function formatDashboardMoneyCents(
  amountCents: number,
  currency: string | null | undefined,
  locale: string = "en",
): string {
  return formatDashboardMoney(Math.round(amountCents) / 100, currency, locale);
}
