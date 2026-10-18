/**
 * formatPrice: the ONE entry point for printing a price to a person (lane 4, brief A6).
 *
 * It composes what already exists instead of adding a second formatter:
 *   - the primary string is `formatDashboardMoneyCents` ("$900 MXN": symbol, amount, code),
 *   - the secondary line is `usdEquivalentLabel` ("≈ US$51") or `formatApproxLocal` ("≈ MX$ 162").
 * The default display currency is MXN (`DEFAULT_DISPLAY_CURRENCY`) when a caller has none.
 *
 * Secondary-line rules (unchanged, only gathered here):
 *   - A price in another currency gets "≈ US$" for talent-facing editors always, and on public
 *     pages only in English (Spanish visitors read the local price only, TUL-551 / GRK-063).
 *   - A USD-billed price on a Spanish page gets "≈ MX$" when an MXN rate is supplied (TUL-864).
 *   - No rate, no line. Never a guess.
 *
 * DISPLAY ONLY: it never converts a stored amount or changes what a checkout charges.
 */
import { DEFAULT_DISPLAY_CURRENCY } from "@/lib/billing/currencies";
import { formatApproxLocal } from "@/lib/pricing/approx-local-price";
import { showsUsdEquivalent, usdEquivalentLabel, type UsdRates } from "@/lib/pricing/usd-equivalent";

import { formatDashboardMoneyCents } from "./dashboard-money-format";

export type FormattedPrice = { primary: string; secondary: string | null };

export function formatPrice(input: {
  amountCents: number;
  currency?: string | null;
  locale?: string | null;
  /** "talent" = editors and dashboards (always show the dollar line); "public" = visitor pages. */
  audience?: "talent" | "public";
  /** Units of each currency per 1 USD. */
  usdRates?: UsdRates | null;
}): FormattedPrice {
  const currency = (input.currency ?? "").trim().toUpperCase() || DEFAULT_DISPLAY_CURRENCY;
  const locale = (input.locale ?? "es").trim() || "es";
  const audience = input.audience ?? "public";
  const primary = formatDashboardMoneyCents(input.amountCents, currency, locale);

  if (currency !== "USD") {
    const wantsDollarLine = audience === "talent" || showsUsdEquivalent(locale);
    return { primary, secondary: wantsDollarLine ? usdEquivalentLabel(input.amountCents, currency, input.usdRates, locale) : null };
  }
  if (locale.toLowerCase().startsWith("es")) {
    const mxn = input.usdRates?.perUsd.MXN;
    return { primary, secondary: formatApproxLocal(input.amountCents, typeof mxn === "number" && mxn > 0 ? mxn : null, "MXN") };
  }
  return { primary, secondary: null };
}
