/**
 * Domain purchase price display — registrar quotes are always USD (charged
 * at checkout), but the drawer shows the amount in the talent's currency
 * with a "charged in USD" note. Display only; never changes what Stripe bills.
 */

import { formatDashboardMoneyCents } from "@/lib/money/dashboard-money-format";
import type { UsdRates } from "@/lib/pricing/usd-equivalent";

/** Local minor units for a USD quote, or null when FX cannot be honest. */
export function localCentsFromUsd(
  usdCents: number | null | undefined,
  currency: string | null | undefined,
  fx: UsdRates | null | undefined,
): number | null {
  if (usdCents == null || !Number.isFinite(usdCents) || usdCents <= 0) return null;
  const cur = (currency ?? "").trim().toUpperCase();
  if (!cur) return null;
  if (cur === "USD") return Math.round(usdCents);
  if (!fx) return null;
  const rate = fx.perUsd[cur];
  if (typeof rate !== "number" || !Number.isFinite(rate) || rate <= 0) return null;
  const local = Math.round(usdCents * rate);
  return local > 0 ? local : null;
}

export type DomainPriceDisplay = {
  /** Primary line in the talent's currency (or USD when that is their currency). */
  primary: string;
  /** Always the USD charge that checkout will take. */
  usdCharge: string;
  /** True when primary is a converted estimate, not the billed amount. */
  converted: boolean;
};

/**
 * Build the two price lines for the domain drawer.
 * When FX is missing and the talent currency is not USD, primary falls back to USD.
 */
export function buildDomainPriceDisplay(opts: {
  usdCents: number;
  talentCurrency: string;
  fx: UsdRates | null | undefined;
  locale: string;
}): DomainPriceDisplay {
  const usdCharge = formatDashboardMoneyCents(opts.usdCents, "USD", opts.locale);
  const cur = (opts.talentCurrency || "USD").trim().toUpperCase() || "USD";
  if (cur === "USD") {
    return { primary: usdCharge, usdCharge, converted: false };
  }
  const local = localCentsFromUsd(opts.usdCents, cur, opts.fx);
  if (local == null) {
    return { primary: usdCharge, usdCharge, converted: false };
  }
  return {
    primary: formatDashboardMoneyCents(local, cur, opts.locale),
    usdCharge,
    converted: true,
  };
}
