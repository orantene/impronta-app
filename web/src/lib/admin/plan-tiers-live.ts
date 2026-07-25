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
 * i18n: this is the LIVE renew path, so the copy it composes is what the
 * plan badge actually renders. Callers pass the request locale and every
 * line resolves through `createTranslator(locale)` — the cadence word, the
 * price template (English "$49 / month.", Spanish "$49 al mes."), and the
 * no-price fallbacks, which reuse the shared `dashboard.adminShared.planRenew.*`
 * catalog entries rather than duplicating them.
 *
 * Marketing↔workspace slug bridge: marketing/admin use `network` for
 * the 4th tier; the Phase 1 catalog uses `hub` (the renamed Network).
 * The output map exports BOTH keys so all callers keep working.
 */

import "server-only";
import type { DefaultCurrencyCode } from "@/lib/billing/currencies";
import { withInterpolation } from "@/i18n/interpolate";
import { createTranslator } from "@/i18n/messages";
import { loadActivePrices } from "@/lib/pricing/get-active-prices";
import { TIER_RENEW, TIER_RENEW_KEY } from "@/lib/admin/plan-tiers";

export type TierRenewLabels = Record<string, string>;

/** Billing cadences the price line can render, mapped to catalog keys. */
const CADENCE_KEY = {
  month: "dashboard.adminPlanLive.cadenceMonth",
  year: "dashboard.adminPlanLive.cadenceYear",
  "one-time": "dashboard.adminPlanLive.cadenceOneTime",
} as const;

type Cadence = keyof typeof CADENCE_KEY;

/** `${price} / ${cadence}.` in English, `${price} al mes.` in Spanish. */
const PRICE_LINE_KEY = "dashboard.adminPlanLive.priceLine";

export async function loadTierRenewLabels(
  currency: DefaultCurrencyCode | string = "USD",
  locale = "en",
): Promise<TierRenewLabels> {
  const t = createTranslator(locale);
  const ti = withInterpolation(t);

  const result = await loadActivePrices(currency);
  const workspace = result.packages.find((p) => p.packageSlug === "workspace");
  // Index the workspace tier prices by slug for quick lookup.
  const headlineByTierSlug = new Map<string, { formatted: string; cadence: Cadence }>();
  for (const tier of workspace?.tiers ?? []) {
    if (!tier.headline) continue;
    const cadence: Cadence =
      tier.headline.interval === "year"
        ? "year"
        : tier.headline.interval === "month"
          ? "month"
          : "one-time";
    headlineByTierSlug.set(tier.slug, { formatted: tier.headline.formatted, cadence });
  }

  /** Localized price line, or null when the catalog has no live price. */
  const priceLine = (
    headline: { formatted: string; cadence: Cadence } | undefined,
  ): string | null =>
    headline
      ? ti(PRICE_LINE_KEY, {
          price: headline.formatted,
          cadence: t(CADENCE_KEY[headline.cadence]),
        })
      : null;

  /** Localized static fallback for a plan slug (shared catalog copy). */
  const fallback = (planKey: string): string => {
    const key = TIER_RENEW_KEY[planKey] ?? TIER_RENEW_KEY.free!;
    const resolved = t(key);
    // `createTranslator` echoes the key back when nothing matches — in that
    // case use the English constant so the line is never a dot-path.
    if (resolved !== key) return resolved;
    return TIER_RENEW[planKey] ?? TIER_RENEW.free!;
  };

  // Compose the renew lines.
  const studio  = headlineByTierSlug.get("studio");
  const agency  = headlineByTierSlug.get("agency");
  const hub     = headlineByTierSlug.get("hub");

  const renew: TierRenewLabels = {
    free: fallback("free"),
    studio: priceLine(studio) ?? fallback("studio"),
    agency: priceLine(agency) ?? fallback("agency"),
    // Both `hub` (new canonical) and `network` (legacy) get the same copy.
    hub: priceLine(hub) ?? fallback("network"),
    network: priceLine(hub) ?? fallback("network"),
  };
  return renew;
}
