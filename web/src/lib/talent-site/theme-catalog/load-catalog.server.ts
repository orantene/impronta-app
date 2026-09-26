import "server-only";

import { unstable_cache } from "next/cache";
import { isTalentMaisonThemeEnabled } from "@/lib/access/talent-maison-theme";
import { logServerError } from "@/lib/server/safe-error";
import { createPublicSupabaseClient } from "@/lib/supabase/public";
import { BUILTIN_DESIGNS, BUILTIN_LOOKS } from "./builtins";
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
 * Whether a talent's plan may APPLY a row is a per-caller fact (it depends
 * on `planKey`), not a property of the row, so it is not baked into the
 * cached catalog read: this module returns `TalentThemeCatalogEntry`
 * (`./types.ts`, `CatalogEntry & { locked }`), computing `locked` fresh per
 * call from `talentPlanAllowsThemeTier`. The gallery UI renders that shape
 * directly (`GalleryCatalogEntry` is an alias of it).
 *
 * `locked` decides the gallery's grey-out-with-upsell treatment; it does
 * NOT hide anything. Every published row of both kinds is returned
 * regardless of `planKey`, so a Basic talent still SEES the Pro/Portfolio
 * designs and looks (locked) rather than the catalog silently shrinking.
 * (`themeTiersAllowedForPlan` remains available for a caller that wants the
 * DB-side `.in("required_talent_tier", …)` hide-entirely variant instead.)
 */

export type { TalentThemeCatalogEntry };

export interface TalentThemeCatalog {
  designs: TalentThemeCatalogEntry[];
  looks: TalentThemeCatalogEntry[];
}

const CATALOG_CACHE_TAG = "talent-theme-catalog";
/** Safety-net TTL; the sync action should `revalidateTag(CATALOG_CACHE_TAG)` for instant refresh (not wired yet — see sync-builtins.server.ts's invocation note). */
const CATALOG_TTL_SECONDS = 300;

const LISTING_COLUMNS =
  "kind, slug, title, summary, category, tags, preview, required_talent_tier, version, sort_order, is_new_until";

interface CatalogListingRow {
  kind: TalentThemeKind;
  slug: string;
  title: string;
  summary: string;
  category: string | null;
  tags: string[];
  preview: ThemePreview;
  required_talent_tier: TalentThemeRequiredTier;
  version: number;
  sort_order: number;
  is_new_until: string | null;
}

function coerceListingRow(raw: unknown): CatalogListingRow | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (r.kind !== "design" && r.kind !== "look") return null;
  if (typeof r.slug !== "string" || r.slug.trim() === "") return null;
  if (!isTalentThemeRequiredTier(r.required_talent_tier)) return null;
  return {
    kind: r.kind,
    slug: r.slug,
    title: typeof r.title === "string" ? r.title : r.slug,
    summary: typeof r.summary === "string" ? r.summary : "",
    category: typeof r.category === "string" ? r.category : null,
    tags: Array.isArray(r.tags) ? r.tags.filter((t): t is string => typeof t === "string") : [],
    preview: (r.preview && typeof r.preview === "object" ? r.preview : {}) as ThemePreview,
    required_talent_tier: r.required_talent_tier,
    version: typeof r.version === "number" ? r.version : 1,
    sort_order: typeof r.sort_order === "number" ? r.sort_order : 0,
    is_new_until: typeof r.is_new_until === "string" ? r.is_new_until : null,
  };
}

/**
 * Cached read of every PUBLISHED row (both kinds). `null` = the read failed
 * (missing env, DB error); `[]` = the table has no published rows yet
 * (before the first sync). Callers fall back to the in-code built-ins on
 * either. Cached as ONE global entry (no `planKey` in the key) since the raw
 * rows do not depend on the caller's plan; `loadTalentThemeCatalog` computes
 * `locked` per call, outside the cache.
 */
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
    ["talent-theme-catalog:published"],
    { revalidate: CATALOG_TTL_SECONDS, tags: [CATALOG_CACHE_TAG] },
  )();
}

function fallbackRows(kind: TalentThemeKind): CatalogListingRow[] {
  const entries = kind === "design" ? BUILTIN_DESIGNS : BUILTIN_LOOKS;
  return entries.map((entry) => ({
    kind: entry.kind,
    slug: entry.slug,
    title: entry.title,
    summary: entry.summary,
    category: entry.category,
    tags: entry.tags,
    preview: entry.preview,
    required_talent_tier: entry.required_talent_tier,
    // The table has no synced version yet; 1 matches every fresh built-in's
    // first-sync version (`sync-builtins.server.ts`'s `planBuiltinSync`).
    version: 1,
    sort_order: entry.sort_order,
    is_new_until: entry.is_new_until,
  }));
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
    preview: row.preview,
    requiredTier: row.required_talent_tier,
    version: row.version,
    sortOrder: row.sort_order,
    isNew: isNewNow(row.is_new_until),
    locked: !talentPlanAllowsThemeTier(planKey, row.required_talent_tier),
  };
}

/**
 * Load the talent theme gallery catalog for one caller's plan. Published
 * rows only, sorted by `sortOrder`, each carrying a `locked` flag for
 * `planKey`. Falls back to the in-code built-ins (`./builtins`) when the
 * table read fails OR returns no published rows, so the gallery renders
 * correctly even before `syncBuiltinTalentThemes` has ever run.
 *
 * Maison Design / Looks / Demos are omitted unless `TALENT_MAISON_THEME_ENABLED`
 * is on — including when this path falls back to in-code built-ins — so
 * flag-off production stays unchanged.
 */
export async function loadTalentThemeCatalog(input: {
  planKey: string | null | undefined;
}): Promise<TalentThemeCatalog> {
  const rows = await loadPublishedRows();
  const raw: CatalogListingRow[] =
    rows && rows.length > 0 ? rows : [...fallbackRows("design"), ...fallbackRows("look")];
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

  return { designs, looks };
}
