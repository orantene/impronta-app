/**
 * get-product-catalog.ts — server-only reader for the Product Pricing
 * dashboard data tree (packages → tiers → prices + features).
 *
 * Used by the commerce catalog surface (`/platform/admin/commerce?tab=catalog`). Uses the service-role
 * client because the new `product_*` tables have NO public RLS policies
 * (only service-role reads/writes — see migration
 * `20260527213552_product_pricing_dashboard.sql`).
 *
 * Cached per-request via React `cache()` so multiple components on the
 * same page (e.g., header KPI + section grid + drawer pre-render) all
 * share one DB round-trip.
 *
 * Split per the server-only boundary pattern: pure types + helpers live
 * in `pricing-types.ts` (no `server-only` marker, importable by client
 * components). This file IS server-only and must not be value-imported
 * from any client component — Next 16 Turbopack hard-errors.
 */

import "server-only";
import { cache } from "react";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError } from "@/lib/server/safe-error";
import type {
  PricingCatalog,
  PricingPackageRow,
  PricingTierRow,
  PricingPriceRow,
  PricingFeatureRow,
  PricingFamily,
  PricingInterval,
  PricingDiscountRow,
} from "./pricing-types";
import {
  PRODUCT_DISCOUNT_SELECT,
  normalizeProductDiscount,
  type RawProductDiscountRow,
} from "./discount-row";

// ─── Row shapes from Supabase (snake_case) ────────────────────────────────────

type PackageRow = {
  id: string;
  slug: string;
  family: string;
  label: string;
  description: string | null;
  display_order: number;
  is_active: boolean;
};

type TierRow = {
  id: string;
  package_id: string;
  slug: string;
  name: string;
  tagline: string | null;
  description: string | null;
  display_order: number;
  is_active: boolean;
  is_featured: boolean;
  stripe_product_id: string | null;
  updated_at: string;
};

type PriceRow = {
  id: string;
  tier_id: string;
  currency: string;
  interval: string;
  unit_amount: number;
  stripe_price_id: string | null;
  is_active: boolean;
  archived_at: string | null;
  valid_from: string | null;
  valid_until: string | null;
  notes: string | null;
  updated_at: string;
};

type FeatureRow = {
  id: string;
  tier_id: string;
  label: string;
  included: boolean;
  highlight: boolean;
  display_order: number;
  category: string | null;
  value_text: string | null;
};

// ─── Loader ──────────────────────────────────────────────────────────────────

const FAMILY_KEYS: PricingFamily[] = ["workspace", "talent", "client"];
const INTERVAL_KEYS: PricingInterval[] = ["month", "year", "once", "lifetime"];

function isFamily(s: string): s is PricingFamily {
  return (FAMILY_KEYS as readonly string[]).includes(s);
}
function isInterval(s: string): s is PricingInterval {
  return (INTERVAL_KEYS as readonly string[]).includes(s);
}

/**
 * Load the full pricing catalog. Returns `null` if the service-role
 * client can't be created (config error) — callers should render an
 * empty-state explaining the misconfiguration.
 */
export const loadProductCatalog = cache(
  async (): Promise<PricingCatalog | null> => {
    const admin = createServiceRoleClient();
    if (!admin) {
      logServerError("get-product-catalog.service-role", null);
      return null;
    }

    const [pkgRes, tierRes, priceRes, featRes] = await Promise.all([
      admin
        .from("product_packages")
        .select("id, slug, family, label, description, display_order, is_active")
        .order("display_order", { ascending: true }),
      admin
        .from("product_tiers")
        .select(
          "id, package_id, slug, name, tagline, description, display_order, is_active, is_featured, stripe_product_id, updated_at",
        )
        .order("display_order", { ascending: true }),
      admin
        .from("product_prices")
        .select(
          "id, tier_id, currency, interval, unit_amount, stripe_price_id, is_active, archived_at, valid_from, valid_until, notes, updated_at",
        )
        .order("interval", { ascending: false }) // month before year visually
        .order("currency", { ascending: true }),
      admin
        .from("product_features")
        .select(
          "id, tier_id, label, included, highlight, display_order, category, value_text",
        )
        .order("display_order", { ascending: true }),
    ]);

    if (pkgRes.error) {
      logServerError("get-product-catalog.packages", pkgRes.error);
      return null;
    }
    if (tierRes.error) {
      logServerError("get-product-catalog.tiers", tierRes.error);
      return null;
    }
    if (priceRes.error) {
      logServerError("get-product-catalog.prices", priceRes.error);
      return null;
    }
    if (featRes.error) {
      logServerError("get-product-catalog.features", featRes.error);
      return null;
    }

    const packagesRaw = (pkgRes.data ?? []) as PackageRow[];
    const tiersRaw = (tierRes.data ?? []) as TierRow[];
    const pricesRaw = (priceRes.data ?? []) as PriceRow[];
    const featsRaw = (featRes.data ?? []) as FeatureRow[];

    const tierPrices = new Map<string, PricingPriceRow[]>();
    for (const p of pricesRaw) {
      const mapped: PricingPriceRow = {
        id: p.id,
        tierId: p.tier_id,
        currency: p.currency,
        interval: isInterval(p.interval) ? p.interval : "month",
        unitAmount: Number(p.unit_amount),
        stripePriceId: p.stripe_price_id,
        isActive: p.is_active,
        archivedAt: p.archived_at,
        validFrom: p.valid_from,
        validUntil: p.valid_until,
        notes: p.notes,
        updatedAt: p.updated_at,
      };
      const bucket = tierPrices.get(p.tier_id);
      if (bucket) bucket.push(mapped);
      else tierPrices.set(p.tier_id, [mapped]);
    }

    const tierFeats = new Map<string, PricingFeatureRow[]>();
    for (const f of featsRaw) {
      const mapped: PricingFeatureRow = {
        id: f.id,
        tierId: f.tier_id,
        label: f.label,
        included: f.included,
        highlight: f.highlight,
        displayOrder: f.display_order,
        category: f.category,
        valueText: f.value_text,
      };
      const bucket = tierFeats.get(f.tier_id);
      if (bucket) bucket.push(mapped);
      else tierFeats.set(f.tier_id, [mapped]);
    }

    const pkgTiers = new Map<string, PricingTierRow[]>();
    for (const t of tiersRaw) {
      const mapped: PricingTierRow = {
        id: t.id,
        packageId: t.package_id,
        slug: t.slug,
        name: t.name,
        tagline: t.tagline,
        description: t.description,
        displayOrder: t.display_order,
        isActive: t.is_active,
        isFeatured: t.is_featured,
        stripeProductId: t.stripe_product_id,
        updatedAt: t.updated_at,
        prices: tierPrices.get(t.id) ?? [],
        features: tierFeats.get(t.id) ?? [],
      };
      const bucket = pkgTiers.get(t.package_id);
      if (bucket) bucket.push(mapped);
      else pkgTiers.set(t.package_id, [mapped]);
    }

    const packages: PricingPackageRow[] = packagesRaw.map((p) => ({
      id: p.id,
      slug: p.slug,
      family: isFamily(p.family) ? p.family : "workspace",
      label: p.label,
      description: p.description,
      displayOrder: p.display_order,
      isActive: p.is_active,
      tiers: pkgTiers.get(p.id) ?? [],
    }));

    return {
      packages,
      loadedAt: new Date().toISOString(),
    };
  },
);

/**
 * Load all discount codes for the Discounts tab (Phase 3 UI; the loader
 * is wired now so the table is testable + types are stable).
 */
export const loadProductDiscounts = cache(
  async (): Promise<PricingDiscountRow[]> => {
    const admin = createServiceRoleClient();
    if (!admin) {
      logServerError("get-product-catalog.discounts.service-role", null);
      return [];
    }
    const { data, error } = await admin
      .from("product_discounts")
      .select(PRODUCT_DISCOUNT_SELECT)
      .order("created_at", { ascending: false });

    if (error) {
      logServerError("get-product-catalog.discounts", error);
      return [];
    }

    return (data ?? []).map((row) =>
      normalizeProductDiscount(row as unknown as RawProductDiscountRow),
    );
  },
);
