/**
 * get-active-prices.ts — marketing-shaped read of the pricing catalog
 * keyed by (tier slug × currency × interval).
 *
 * This is the THIN read that marketing surfaces (`get-started/page.tsx`,
 * `pricing-teaser-section.tsx`, `get-started-form.tsx`, and any future
 * landing page) use to render tier cards. It returns just the price +
 * display copy — no admin metadata, no Stripe IDs.
 *
 * Per-tier fallback to USD: when a tier has no row for the requested
 * currency, the loader falls back to the USD row and tags the result
 * with `fellBackToUSD: true` so the UI can footnote it ("Studio in MXN
 * coming soon — showing USD").
 *
 * Service-role read (same as `loadProductCatalog`) since prices are
 * public and there's no per-user gating.
 *
 * Cached per-request via React `cache()` so the same marketing route
 * can call it from multiple components without round-tripping.
 */

import "server-only";
import { cache } from "react";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError } from "@/lib/server/safe-error";
import type { DefaultCurrencyCode } from "@/lib/billing/currencies";
import {
  formatUnitAmount,
  intervalSuffix,
  type PricingInterval,
} from "./pricing-types";

// ─── Public shape ────────────────────────────────────────────────────────────

export type ActiveTierPrice = {
  /** Always the requested-currency amount when available; falls back to USD. */
  unitAmount: number;
  /** Smallest currency unit's currency code (UPPERCASE). */
  currency: string;
  interval: PricingInterval;
  stripePriceId: string | null;
  /** Pre-formatted for direct rendering (e.g., "$49" or "MX$849"). */
  formatted: string;
  /** Pre-formatted interval suffix (e.g., "/ mo"). */
  intervalLabel: string;
  /** True when the tier had no row for the requested currency. */
  fellBackToUSD: boolean;
  /** Phase 5 — true when this row is a sale price (has a window set)
   *  that's currently active. Marketing surfaces show a "Sale" pill. */
  isOnSale: boolean;
  /** Phase 5 — sale end ISO when isOnSale is true; null otherwise. */
  saleEndsAt: string | null;
  /** Phase 5 — the canonical (non-sale) price amount, for strike-through
   *  display. Equal to unitAmount when isOnSale=false. */
  canonicalAmount: number;
};

export type ActiveTier = {
  packageSlug: string;
  packageLabel: string;
  family: string;
  slug: string;
  name: string;
  tagline: string | null;
  description: string | null;
  isFeatured: boolean;
  isActive: boolean;
  /** Headline price (monthly preferred, then yearly). null for Free / Hub
   *  / Client trust tiers that have no recurring price. */
  headline: ActiveTierPrice | null;
  /** All active prices for this tier in the requested currency (with
   *  per-row USD fallback) — `[month, year, …]`. */
  prices: ActiveTierPrice[];
  /** Top-of-card highlights (features with `highlight=true`), already
   *  sorted by display_order. */
  highlights: string[];
};

export type ActivePricesByPackage = {
  packageSlug: string;
  packageLabel: string;
  family: string;
  tiers: ActiveTier[];
};

export type ActivePricesResult = {
  /** Currency the loader was asked for. Same as input. */
  requestedCurrency: string;
  /** True if ANY tier fell back to USD; lets the UI show a single banner. */
  anyFellBackToUSD: boolean;
  packages: ActivePricesByPackage[];
  loadedAt: string;
};

// ─── Loader ──────────────────────────────────────────────────────────────────

type RawTier = {
  id: string;
  package_id: string;
  slug: string;
  name: string;
  tagline: string | null;
  description: string | null;
  display_order: number;
  is_active: boolean;
  is_featured: boolean;
};

type RawPackage = {
  id: string;
  slug: string;
  family: string;
  label: string;
  display_order: number;
  is_active: boolean;
};

type RawPrice = {
  id: string;
  tier_id: string;
  currency: string;
  interval: string;
  unit_amount: number;
  stripe_price_id: string | null;
  valid_from: string | null;
  valid_until: string | null;
};

type RawFeature = {
  id: string;
  tier_id: string;
  label: string;
  highlight: boolean;
  display_order: number;
};

const INTERVAL_RANK: Record<string, number> = {
  month: 0,
  year: 1,
  once: 2,
  lifetime: 3,
};

function isInterval(s: string): s is PricingInterval {
  return s === "month" || s === "year" || s === "once" || s === "lifetime";
}

/** Pick the headline price from a list of active prices in the requested
 *  currency. Preference: month > year > first. */
function pickHeadline(prices: ActiveTierPrice[]): ActiveTierPrice | null {
  if (prices.length === 0) return null;
  return (
    prices.find((p) => p.interval === "month") ??
    prices.find((p) => p.interval === "year") ??
    prices[0] ??
    null
  );
}

export const loadActivePrices = cache(
  async (
    currency: DefaultCurrencyCode | string,
  ): Promise<ActivePricesResult> => {
    const upperCurrency = currency.toUpperCase();
    const now = new Date().toISOString();
    const admin = createServiceRoleClient();
    if (!admin) {
      logServerError("get-active-prices.service-role", null);
      return {
        requestedCurrency: upperCurrency,
        anyFellBackToUSD: false,
        packages: [],
        loadedAt: now,
      };
    }

    const [pkgRes, tierRes, priceRes, featRes] = await Promise.all([
      admin
        .from("product_packages")
        .select("id, slug, family, label, display_order, is_active")
        .eq("is_active", true)
        .order("display_order", { ascending: true }),
      admin
        .from("product_tiers")
        .select(
          "id, package_id, slug, name, tagline, description, display_order, is_active, is_featured",
        )
        .eq("is_active", true)
        .order("display_order", { ascending: true }),
      admin
        .from("product_prices")
        .select(
          "id, tier_id, currency, interval, unit_amount, stripe_price_id, valid_from, valid_until",
        )
        .eq("is_active", true)
        .is("archived_at", null),
      admin
        .from("product_features")
        .select("id, tier_id, label, highlight, display_order")
        .eq("highlight", true)
        .order("display_order", { ascending: true }),
    ]);

    if (pkgRes.error || tierRes.error || priceRes.error || featRes.error) {
      logServerError(
        "get-active-prices.fetch",
        pkgRes.error ?? tierRes.error ?? priceRes.error ?? featRes.error,
      );
      return {
        requestedCurrency: upperCurrency,
        anyFellBackToUSD: false,
        packages: [],
        loadedAt: now,
      };
    }

    const pkgs = (pkgRes.data ?? []) as RawPackage[];
    const tiers = (tierRes.data ?? []) as RawTier[];
    const prices = (priceRes.data ?? []) as RawPrice[];
    const feats = (featRes.data ?? []) as RawFeature[];

    // Index features by tier.
    const featsByTier = new Map<string, RawFeature[]>();
    for (const f of feats) {
      const bucket = featsByTier.get(f.tier_id);
      if (bucket) bucket.push(f);
      else featsByTier.set(f.tier_id, [f]);
    }

    let anyFellBack = false;
    const nowMs = Date.now();

    // Phase 5 — sale-aware effective-row picker. Given a list of rows
    // for one (tier × currency × interval), prefers an in-window sale,
    // falls back to canonical (null window). Returns { effective,
    // canonical } so the caller can tag isOnSale + canonicalAmount for
    // strike-through display.
    function pickEffective(
      rows: RawPrice[],
    ): { effective: RawPrice; canonical: RawPrice | null } | null {
      if (rows.length === 0) return null;
      const canonical = rows.find(
        (r) => r.valid_from === null && r.valid_until === null,
      ) ?? null;
      const inWindow = rows.find((r) => {
        if (r.valid_from === null && r.valid_until === null) return false;
        const start = r.valid_from ? new Date(r.valid_from).getTime() : -Infinity;
        const end = r.valid_until ? new Date(r.valid_until).getTime() : Infinity;
        return nowMs >= start && nowMs < end;
      });
      if (inWindow) return { effective: inWindow, canonical };
      if (canonical) return { effective: canonical, canonical };
      // Edge case: only future / expired sale rows exist. Return any
      // canonical-shaped one for back-compat; otherwise null so the
      // caller skips this slot entirely.
      return null;
    }

    function buildActivePrice(
      effective: RawPrice,
      canonical: RawPrice | null,
      currencyOut: string,
      intervalOut: PricingInterval,
      fellBackToUSD: boolean,
    ): ActiveTierPrice {
      const isOnSale =
        effective.valid_from !== null || effective.valid_until !== null;
      const canonicalAmount = canonical
        ? Number(canonical.unit_amount)
        : Number(effective.unit_amount);
      return {
        unitAmount: Number(effective.unit_amount),
        currency: currencyOut,
        interval: intervalOut,
        stripePriceId: effective.stripe_price_id,
        formatted: formatUnitAmount(
          Number(effective.unit_amount),
          currencyOut,
        ),
        intervalLabel: intervalSuffix(intervalOut),
        fellBackToUSD,
        isOnSale,
        saleEndsAt: isOnSale ? effective.valid_until : null,
        canonicalAmount,
      };
    }

    // Build tiers per package.
    const tiersByPkg = new Map<string, ActiveTier[]>();
    for (const t of tiers) {
      const tierPrices: ActiveTierPrice[] = [];
      const seenIntervals = new Set<string>();

      // 1. Requested-currency rows — group by interval, pick effective.
      const byIntervalRequested = new Map<PricingInterval, RawPrice[]>();
      for (const p of prices) {
        if (
          p.tier_id !== t.id ||
          p.currency.toUpperCase() !== upperCurrency
        ) {
          continue;
        }
        const interval = isInterval(p.interval) ? p.interval : "month";
        const bucket = byIntervalRequested.get(interval);
        if (bucket) bucket.push(p);
        else byIntervalRequested.set(interval, [p]);
      }
      for (const [interval, rows] of byIntervalRequested.entries()) {
        const picked = pickEffective(rows);
        if (!picked) continue;
        seenIntervals.add(interval);
        tierPrices.push(
          buildActivePrice(
            picked.effective,
            picked.canonical,
            upperCurrency,
            interval,
            false,
          ),
        );
      }

      // 2. USD fallback — same shape, only fills intervals not yet seen.
      if (upperCurrency !== "USD") {
        const byIntervalUsd = new Map<PricingInterval, RawPrice[]>();
        for (const p of prices) {
          if (p.tier_id !== t.id || p.currency.toUpperCase() !== "USD") continue;
          const interval = isInterval(p.interval) ? p.interval : "month";
          if (seenIntervals.has(interval)) continue;
          const bucket = byIntervalUsd.get(interval);
          if (bucket) bucket.push(p);
          else byIntervalUsd.set(interval, [p]);
        }
        for (const [interval, rows] of byIntervalUsd.entries()) {
          const picked = pickEffective(rows);
          if (!picked) continue;
          seenIntervals.add(interval);
          anyFellBack = true;
          tierPrices.push(
            buildActivePrice(
              picked.effective,
              picked.canonical,
              "USD",
              interval,
              true,
            ),
          );
        }
      }
      // Stable order.
      tierPrices.sort(
        (a, b) =>
          (INTERVAL_RANK[a.interval] ?? 9) - (INTERVAL_RANK[b.interval] ?? 9),
      );
      const highlights = (featsByTier.get(t.id) ?? []).map((f) => f.label);

      const built: ActiveTier = {
        packageSlug: "", // filled below
        packageLabel: "",
        family: "",
        slug: t.slug,
        name: t.name,
        tagline: t.tagline,
        description: t.description,
        isFeatured: t.is_featured,
        isActive: t.is_active,
        headline: pickHeadline(tierPrices),
        prices: tierPrices,
        highlights,
      };
      const bucket = tiersByPkg.get(t.package_id);
      if (bucket) bucket.push(built);
      else tiersByPkg.set(t.package_id, [built]);
    }

    // Stitch packages + tiers; backfill package-level fields on each tier.
    const packagesOut: ActivePricesByPackage[] = pkgs.map((p) => {
      const tiersOut = (tiersByPkg.get(p.id) ?? []).map((t) => ({
        ...t,
        packageSlug: p.slug,
        packageLabel: p.label,
        family: p.family,
      }));
      return {
        packageSlug: p.slug,
        packageLabel: p.label,
        family: p.family,
        tiers: tiersOut,
      };
    });

    return {
      requestedCurrency: upperCurrency,
      anyFellBackToUSD: anyFellBack,
      packages: packagesOut,
      loadedAt: now,
    };
  },
);

// ─── Marketing-tier adapter ──────────────────────────────────────────────────
// The existing marketing components expect a flatter `Tier` shape (price as
// pre-formatted string, cadence as separate field, highlights as bullet
// strings). This adapter lets us migrate marketing files file-by-file
// without simultaneously rewriting their UI.

export type MarketingTier = {
  key: string;
  name: string;
  /** Pre-formatted price ("$49" / "MX$849") or copy like "Talk to us" / "$0". */
  price: string;
  /** "per month" / "per year" / "forever" / "" — keeps existing render API. */
  cadence: string;
  tagline: string;
  highlights: string[];
  featured: boolean;
  /** True when the displayed price is USD because the requested currency
   *  has no row for this tier. */
  fellBackToUSD: boolean;
  /** Phase 5 — true when this card's headline is a sale price. */
  isOnSale: boolean;
  /** Phase 5 — formatted canonical (non-sale) price for strike-through.
   *  Equal to `price` when isOnSale=false. */
  canonicalPrice: string;
};

const CADENCE_BY_INTERVAL: Record<PricingInterval, string> = {
  month: "per month",
  year: "per year",
  once: "one-time",
  lifetime: "one-time",
};

/**
 * Convenience wrapper: load + transform to the marketing `Tier` shape
 * for a specific package (workspace / talent / client). Free tiers and
 * Hub/Enterprise tiers without a price get sensible defaults so legacy
 * marketing copy doesn't break.
 */
export async function loadMarketingTiers(
  packageSlug: string,
  currency: DefaultCurrencyCode | string,
): Promise<MarketingTier[]> {
  const result = await loadActivePrices(currency);
  const pkg = result.packages.find((p) => p.packageSlug === packageSlug);
  if (!pkg) return [];
  return pkg.tiers.map((t) => {
    const isFree = t.slug === "free";
    const isHub = t.slug === "hub";
    const isContactSales = isHub && !t.headline;
    // Pre-format the visible price string. Marketing copy expects:
    //   - Free tier         → "$0"
    //   - No-price Hub      → "Talk to us"
    //   - Active priced tier → formatted amount in requested or fallback
    let price: string;
    let cadence: string;
    if (isContactSales) {
      price = "Talk to us";
      cadence = "";
    } else if (isFree && !t.headline) {
      price = "$0";
      cadence = "forever";
    } else if (t.headline) {
      price = t.headline.formatted;
      cadence = CADENCE_BY_INTERVAL[t.headline.interval] ?? "";
    } else {
      // Unknown shape — fall through to a safe "—" so we never render
      // an undefined React child.
      price = "—";
      cadence = "";
    }
    const isOnSale = Boolean(t.headline?.isOnSale);
    const canonicalPrice =
      isOnSale && t.headline
        ? formatUnitAmount(t.headline.canonicalAmount, t.headline.currency)
        : price;
    return {
      key: t.slug,
      name: t.name,
      price,
      cadence,
      tagline: t.tagline ?? "",
      highlights: t.highlights,
      featured: t.isFeatured,
      fellBackToUSD: Boolean(t.headline?.fellBackToUSD),
      isOnSale,
      canonicalPrice,
    };
  });
}
