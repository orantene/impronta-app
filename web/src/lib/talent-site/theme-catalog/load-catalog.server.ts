import "server-only";

import { unstable_cache } from "next/cache";
import { isTalentMaisonThemeEnabled } from "@/lib/access/talent-maison-theme";
import { logServerError } from "@/lib/server/safe-error";
import { createPublicSupabaseClient } from "@/lib/supabase/public";
import { BUILTIN_DESIGNS, BUILTIN_LOOKS } from "./builtins";
import {
  MAISON_BUILTIN_DEMO,
  MAISON_BUILTIN_DESIGN,
  MAISON_BUILTIN_LOOKS,
} from "./maison/builtins";
import { filterCatalogRowsForMaisonFlag } from "./maison/catalog-visibility";
import { isTalentThemeRequiredTier, talentPlanAllowsThemeTier } from "./tier";
import type {
  TalentThemeCatalogEntry,
  TalentThemeKind,
  TalentThemeRequiredTier,
  ThemePreview,
} from "./types";

/**
 * Talent theme gallery: CATALOG LOADER — the read path the gallery UI (0.C)
 * calls to render the Design + Look pickers.
 *
 * Maison Design / Looks / Demos are omitted unless `TALENT_MAISON_THEME_ENABLED`
 * is on — including when this path falls back to in-code built-ins — so
 * flag-off production stays unchanged.
 */

export type { TalentThemeCatalogEntry };

export interface TalentThemeCatalog {
  designs: TalentThemeCatalogEntry[];
  looks: TalentThemeCatalogEntry[];
  demos: TalentThemeCatalogEntry[];
}

const CATALOG_CACHE_TAG = "talent-theme-catalog";
const CATALOG_TTL_SECONDS = 300;

const LISTING_COLUMNS =
  "kind, slug, title, summary, category, tags, for_design, preview, required_talent_tier, version, sort_order, is_new_until";

interface CatalogListingRow {
  kind: TalentThemeKind;
  slug: string;
  title: string;
  summary: string;
  category: string | null;
  tags: string[];
  for_design: string | null;
  preview: ThemePreview;
  required_talent_tier: TalentThemeRequiredTier;
  version: number;
  sort_order: number;
  is_new_until: string | null;
}

function coerceListingRow(raw: unknown): CatalogListingRow | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (r.kind !== "design" && r.kind !== "look" && r.kind !== "demo") return null;
  if (typeof r.slug !== "string" || r.slug.trim() === "") return null;
  if (!isTalentThemeRequiredTier(r.required_talent_tier)) return null;
  return {
    kind: r.kind,
    slug: r.slug,
    title: typeof r.title === "string" ? r.title : r.slug,
    summary: typeof r.summary === "string" ? r.summary : "",
    category: typeof r.category === "string" ? r.category : null,
    tags: Array.isArray(r.tags) ? r.tags.filter((t): t is string => typeof t === "string") : [],
    for_design: typeof r.for_design === "string" ? r.for_design : null,
    preview: (r.preview && typeof r.preview === "object" ? r.preview : {}) as ThemePreview,
    required_talent_tier: r.required_talent_tier,
    version: typeof r.version === "number" ? r.version : 1,
    sort_order: typeof r.sort_order === "number" ? r.sort_order : 0,
    is_new_until: typeof r.is_new_until === "string" ? r.is_new_until : null,
  };
}

function loadPublishedRows(): Promise<CatalogListingRow[] | null> {
  return unstable_cache(
    async (): Promise<CatalogListingRow[] | null> => {
      const supabase = createPublicSupabaseClient();
      if (!supabase) return null;
      const { data, error } = await supabase
        .from("talent_theme_catalog")
        .select(LISTING_COLUMNS)
        .eq("status", "published")
        .order("kind", { ascending: true })
        .order("sort_order", { ascending: true });
      if (error) {
        logServerError("talentTheme.catalog.load", error);
        return null;
      }
      const rows: CatalogListingRow[] = [];
      for (const raw of data ?? []) {
        const row = coerceListingRow(raw);
        if (row) rows.push(row);
      }
      return rows;
    },
    ["talent-theme-catalog:published-v2"],
    { revalidate: CATALOG_TTL_SECONDS, tags: [CATALOG_CACHE_TAG] },
  )();
}

function fallbackRows(): CatalogListingRow[] {
  const maisonOn = isTalentMaisonThemeEnabled();
  const designs = [
    ...BUILTIN_DESIGNS,
    ...(maisonOn ? [MAISON_BUILTIN_DESIGN] : []),
  ].map((entry) => ({
    kind: entry.kind as TalentThemeKind,
    slug: entry.slug,
    title: entry.title,
    summary: entry.summary,
    category: entry.category,
    tags: entry.tags,
    for_design: null as string | null,
    preview: entry.preview,
    required_talent_tier: entry.required_talent_tier,
    version: 1,
    sort_order: entry.sort_order,
    is_new_until: entry.is_new_until,
  }));
  const looks = [
    ...BUILTIN_LOOKS,
    ...(maisonOn ? [...MAISON_BUILTIN_LOOKS] : []),
  ].map((entry) => ({
    kind: entry.kind as TalentThemeKind,
    slug: entry.slug,
    title: entry.title,
    summary: entry.summary,
    category: entry.category,
    tags: entry.tags,
    for_design: "for_design" in entry && typeof entry.for_design === "string" ? entry.for_design : null,
    preview: entry.preview,
    required_talent_tier: entry.required_talent_tier,
    version: 1,
    sort_order: entry.sort_order,
    is_new_until: entry.is_new_until,
  }));
  const demos = maisonOn
    ? [
        {
          kind: "demo" as const,
          slug: MAISON_BUILTIN_DEMO.slug,
          title: MAISON_BUILTIN_DEMO.title,
          summary: MAISON_BUILTIN_DEMO.summary,
          category: MAISON_BUILTIN_DEMO.category,
          tags: MAISON_BUILTIN_DEMO.tags,
          for_design: MAISON_BUILTIN_DEMO.for_design,
          preview: MAISON_BUILTIN_DEMO.preview,
          required_talent_tier: MAISON_BUILTIN_DEMO.required_talent_tier,
          version: 1,
          sort_order: MAISON_BUILTIN_DEMO.sort_order,
          is_new_until: MAISON_BUILTIN_DEMO.is_new_until,
        },
      ]
    : [];
  return [...designs, ...looks, ...demos];
}

function isNewNow(isNewUntil: string | null): boolean {
  if (!isNewUntil) return false;
  const at = Date.parse(isNewUntil);
  return Number.isFinite(at) && at > Date.now();
}

function toEntry(
  row: CatalogListingRow,
  planKey: string | null | undefined,
): TalentThemeCatalogEntry {
  return {
    kind: row.kind,
    slug: row.slug,
    title: row.title,
    summary: row.summary,
    category: row.category,
    tags: row.tags,
    forDesign: row.for_design,
    preview: row.preview,
    requiredTier: row.required_talent_tier,
    version: row.version,
    sortOrder: row.sort_order,
    isNew: isNewNow(row.is_new_until),
    locked: !talentPlanAllowsThemeTier(planKey, row.required_talent_tier),
  };
}

/**
 * Load the talent theme gallery catalog for one caller's plan.
 */
export async function loadTalentThemeCatalog(input: {
  planKey: string | null | undefined;
}): Promise<TalentThemeCatalog> {
  const rows = await loadPublishedRows();
  const raw: CatalogListingRow[] = rows && rows.length > 0 ? rows : fallbackRows();
  const source = filterCatalogRowsForMaisonFlag(raw, isTalentMaisonThemeEnabled());

  const bySortOrder = (a: CatalogListingRow, b: CatalogListingRow) => a.sort_order - b.sort_order;
  const designs = source
    .filter((r) => r.kind === "design")
    .sort(bySortOrder)
    .map((r) => toEntry(r, input.planKey));
  const looks = source
    .filter((r) => r.kind === "look")
    .sort(bySortOrder)
    .map((r) => toEntry(r, input.planKey));
  const demos = source
    .filter((r) => r.kind === "demo")
    .sort(bySortOrder)
    .map((r) => toEntry(r, input.planKey));

  return { designs, looks, demos };
}
