import "server-only";

import { needsUsdRates, type UsdRates } from "@/lib/pricing/usd-equivalent";
import { loadUsdRates } from "@/lib/pricing/usd-rates";

/**
 * D-MSG-421 — the vanity / Max-site path must load rates when any published
 * price is not already in dollars. The profile storefront already did this;
 * `renderTalentMaxSite` did not, so a peso menu printed no ≈ US$ line.
 *
 * Refuses rather than guesses: USD-only or unpriced lists skip the fetch.
 */
export async function loadUsdRatesForSitePrices(
  items: ReadonlyArray<{ currency?: string | null; amountCents?: number | null }>,
): Promise<UsdRates | null> {
  if (!needsUsdRates(items)) return null;
  return loadUsdRates();
}
