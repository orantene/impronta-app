/**
 * get-compare-table.ts — server-only reader for the marketing
 * /pricing compare-table (L50 Phase 4).
 *
 * Reads `product_features` rows that have a NON-NULL category (excluding
 * 'core', which powers highlight chips not the compare table), groups
 * them by category, and builds a per-tier matrix.
 *
 * Column ordering: workspace tier display_order (free → studio → agency
 * → hub). Row ordering inside a section: features' own display_order.
 * Section ordering: COMPARE_CATEGORY_ORDER from pricing-types.
 *
 * Service-role read (same as `loadActivePrices` / `loadProductCatalog`)
 * since pricing data is public.
 */

import "server-only";
import { cache } from "react";
import { pickLabel } from "./compare-table-locale";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError } from "@/lib/server/safe-error";
import {
  COMPARE_CATEGORY_ORDER,
  type CompareTable,
  type CompareTableRow,
  type CompareTableSection,
} from "./pricing-types";

type RawTier = {
  id: string;
  slug: string;
  name: string;
  display_order: number;
};

type RawFeature = {
  tier_id: string;
  label: string;
  included: boolean;
  display_order: number;
  category: string | null;
  value_text: string | null;
  /** jsonb {en, es}. Narrowed by `pickLabel`, never trusted as a shape. */
  label_i18n: unknown;
  value_text_i18n: unknown;
};

/**
 * Load the compare table for a package (defaults to "workspace" — the
 * only package the current /pricing page renders).
 *
 * Returns null on misconfiguration so the caller can render an empty
 * state rather than crash.
 */
export const loadCompareTable = cache(
  async (
    packageSlug: string = "workspace",
    locale: string = "en",
  ): Promise<CompareTable | null> => {
    const admin = createServiceRoleClient();
    if (!admin) {
      logServerError("get-compare-table.service-role", null);
      return null;
    }

    // 1. Resolve the package's active tiers in display order.
    const pkgRes = await admin
      .from("product_packages")
      .select("id")
      .eq("slug", packageSlug)
      .maybeSingle();
    if (pkgRes.error || !pkgRes.data) {
      logServerError("get-compare-table.package", pkgRes.error);
      return null;
    }
    const pkgId = (pkgRes.data as { id: string }).id;

    const tierRes = await admin
      .from("product_tiers")
      .select("id, slug, name, display_order")
      .eq("package_id", pkgId)
      .eq("is_active", true)
      .order("display_order", { ascending: true });
    if (tierRes.error) {
      logServerError("get-compare-table.tiers", tierRes.error);
      return null;
    }
    const tiers = (tierRes.data ?? []) as RawTier[];
    if (tiers.length === 0) {
      return {
        tierSlugs: [],
        tierLabels: {},
        sections: [],
      };
    }
    const tierIds = tiers.map((t) => t.id);

    // 2. All compare-table features (NON-NULL category, NOT 'core').
    const featRes = await admin
      .from("product_features")
      .select("tier_id, label, included, display_order, category, value_text, label_i18n, value_text_i18n")
      .in("tier_id", tierIds)
      .not("category", "is", null)
      .neq("category", "core")
      .order("display_order", { ascending: true });
    if (featRes.error) {
      logServerError("get-compare-table.features", featRes.error);
      return null;
    }
    const features = (featRes.data ?? []) as RawFeature[];

    // 3. Pivot into (category, label) → tierSlug → cell.
    //    Use a Map keyed by `${category}|${label}` so duplicate
    //    labels within a category collapse.
    type Key = string;
    type Pivot = {
      category: string;
      label: string;
      /** Lowest display_order seen for this (category, label). Used to
       *  order rows within the section. */
      displayOrder: number;
      /** tierSlug → cell. Missing tier = absent key. */
      byTier: Map<
        string,
        { included: boolean; value: string | null }
      >;
    };
    const pivot = new Map<Key, Pivot>();
    const tierIdToSlug = new Map(tiers.map((t) => [t.id, t.slug]));
    for (const f of features) {
      if (!f.category) continue; // SQL filter already excluded null, defensive
      // Key on the ENGLISH label. It is the stable identity: keying on the
      // localised one would collapse different rows in one locale and not in
      // another, so the table's shape would depend on who is reading it.
      const key = `${f.category}|${f.label}`;
      let row = pivot.get(key);
      if (!row) {
        row = {
          category: f.category,
          label: pickLabel(f.label_i18n, f.label, locale),
          displayOrder: f.display_order,
          byTier: new Map(),
        };
        pivot.set(key, row);
      } else if (f.display_order < row.displayOrder) {
        row.displayOrder = f.display_order;
      }
      const slug = tierIdToSlug.get(f.tier_id);
      if (slug) {
        row.byTier.set(slug, {
          included: f.included,
          value:
            f.value_text === null
              ? null
              : pickLabel(f.value_text_i18n, f.value_text, locale),
        });
      }
    }

    // 4. Bucket rows by category.
    const byCat = new Map<string, Pivot[]>();
    for (const row of pivot.values()) {
      const bucket = byCat.get(row.category);
      if (bucket) bucket.push(row);
      else byCat.set(row.category, [row]);
    }
    // Sort rows within each section.
    for (const rows of byCat.values()) {
      rows.sort((a, b) => a.displayOrder - b.displayOrder);
    }

    // 5. Build sections in the canonical order (then alphabetize any
    //    unknown categories at the end).
    const knownCats = new Set(COMPARE_CATEGORY_ORDER);
    const orderedCats = [
      ...COMPARE_CATEGORY_ORDER.filter((c) => byCat.has(c)),
      ...[...byCat.keys()]
        .filter((c) => !knownCats.has(c))
        .sort(),
    ];

    const sections: CompareTableSection[] = orderedCats.map((cat) => {
      const rows: CompareTableRow[] = (byCat.get(cat) ?? []).map((r) => ({
        label: r.label,
        category: cat,
        cells: tiers.map((t) => {
          const cell = r.byTier.get(t.slug);
          if (!cell) {
            return { tierSlug: t.slug, missing: true as const };
          }
          return {
            tierSlug: t.slug,
            included: cell.included,
            value: cell.value,
          };
        }),
      }));
      return { category: cat, rows };
    });

    return {
      tierSlugs: tiers.map((t) => t.slug),
      tierLabels: Object.fromEntries(tiers.map((t) => [t.slug, t.name])),
      sections,
    };
  },
);
