/**
 * plan-tiers-live.ts — server-only, catalog-backed version of TIER_RENEW.
 *
 * The static `TIER_RENEW` in `plan-tiers.ts` is a hard-coded fallback
 * ("$49 / month."). This module reads the live monthly price from
 * `product_prices` (via `loadActivePrices`) and returns the same shape
 * with current values, optionally currency-localized.
 *
 * Server-only because it imports `loadActivePrices` (service-role DB
 * read). Pass the returned map to `resolveTier(planKey, liveMap)` from
 * `plan-tiers.ts` to get the standard label/dot/renew shape with the
 * fresh renew line baked in.
 *
 * Marketing↔workspace slug bridge: marketing/admin use `network` for
 * the 4th tier; the Phase 1 catalog uses `hub` (the renamed Network).
 * The output map exports BOTH keys so all callers keep working.
 */

import "server-only";
import type { DefaultCurrencyCode } from "@/lib/billing/currencies";
import { loadActivePrices } from "@/lib/pricing/get-active-prices";

export type TierRenewLabels = Record<string, string>;

export async function loadTierRenewLabels(
  currency: DefaultCurrencyCode | string = "USD",
): Promise<TierRenewLabels> {
  const result = await loadActivePrices(currency);
  const workspace = result.packages.find((p) => p.packageSlug === "workspace");
  // Index the workspace tier prices by slug for quick lookup.
  const headlineByTierSlug = new Map<string, { formatted: string; cadence: string }>();
  for (const t of workspace?.tiers ?? []) {
    if (!t.headline) continue;
    const cadence =
      t.headline.interval === "year"
        ? "year"
        : t.headline.interval === "month"
          ? "month"
          : "one-time";
    headlineByTierSlug.set(t.slug, { formatted: t.headline.formatted, cadence });
  }

  // Compose the renew lines.
  const studio  = headlineByTierSlug.get("studio");
  const agency  = headlineByTierSlug.get("agency");
  const hub     = headlineByTierSlug.get("hub");

  const renew: TierRenewLabels = {
    free: "No renewal — Free plan.",
    studio: studio
      ? `${studio.formatted} / ${studio.cadence}.`
      : "$49 / month.",
    agency: agency
      ? `${agency.formatted} / ${agency.cadence}.`
      : "$149 / month.",
    // Both `hub` (new canonical) and `network` (legacy) get the same copy.
    hub: hub
      ? `${hub.formatted} / ${hub.cadence}.`
      : "Custom contract · contact billing.",
    network: hub
      ? `${hub.formatted} / ${hub.cadence}.`
      : "Custom contract · contact billing.",
  };
  return renew;
}
