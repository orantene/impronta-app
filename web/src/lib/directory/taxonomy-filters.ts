import { unstable_cache } from "next/cache";
import { CACHE_TAG_TAXONOMY } from "@/lib/cache-tags";
import { pickLocale } from "@/lib/i18n/pick-locale";
import { createPublicSupabaseClient } from "@/lib/supabase/public";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { fetchAllTaxonomyTerms } from "@/lib/supabase/paged";
import { byName } from "@/lib/field-engine/sort-comparators";

export type TaxonomyFilterOption = {
  id: string;
  slug: string;
  name: string;
  /**
   * Legacy enum (talent_type, skill, language, …). Preserved for back-compat
   * with existing filter UI. Prefer `termType` for v2 hierarchy logic.
   */
  kind: string;
  /**
   * v2 hierarchical type (parent_category, category_group, talent_type,
   * specialty, skill_group, skill, context_group, context, credential,
   * attribute, language). May be null on rows that predate the migration.
   */
  termType: string | null;
  parentId: string | null;
  level: number;
  /** When true, the term is exposed as a public marketplace filter (top-bar). */
  isPublicFilter: boolean;
  isActive: boolean;
  searchSynonyms: string[];
};

async function loadTaxonomyTermsUncached(
  locale: string,
  tenantId: string | null = null,
): Promise<TaxonomyFilterOption[]> {
  const supabase = createPublicSupabaseClient();
  if (!supabase) {
    return [];
  }

  type TaxonomyTermRow = {
    id: string;
    slug: string;
    kind: string;
    term_type: string | null;
    parent_id: string | null;
    level: number | null;
    is_public_filter: boolean | null;
    is_active: boolean | null;
    search_synonyms: string[] | null;
    // name_en/name_es folded into name_i18n {en,es} (WS4).
    name_i18n: Record<string, string | null> | null;
    sort_order: number | null;
  };

  // `archived_at IS NULL` alone ≈ 1068 rows > PostgREST's 1000-row cap, so an
  // un-paged select silently dropped terms past row 1000 — directory-critical
  // (the marketplace filter facets). Page by `id`, then re-sort by the original
  // display order (term_type → kind → sort_order) below. The final output is
  // also re-sorted by display_order/sort_order, but we restore this order first
  // so any stable-sort ties resolve identically to the old query.
  let rows: TaxonomyTermRow[];
  try {
    rows = await fetchAllTaxonomyTerms<TaxonomyTermRow>(
      supabase,
      "id, slug, kind, term_type, parent_id, level, is_public_filter, is_active, search_synonyms, name_i18n, sort_order",
      (q) => q.is("archived_at", null),
    );
  } catch {
    return [];
  }
  rows.sort((a, b) => {
    // Match the old query's `.order("term_type", { nullsFirst: false })` —
    // nulls sort LAST — then kind, then sort_order.
    const at = a.term_type;
    const bt = b.term_type;
    if (at !== bt) {
      if (at == null) return 1;
      if (bt == null) return -1;
      const c = at.localeCompare(bt);
      if (c !== 0) return c;
    }
    return (
      (a.kind ?? "").localeCompare(b.kind ?? "") ||
      (a.sort_order ?? 0) - (b.sort_order ?? 0)
    );
  });
  const rowById = new Map(rows.map((row) => [row.id, row] as const));
  const tenantSettings = new Map<
    string,
    {
      is_enabled: boolean | null;
      show_in_directory: boolean | null;
      display_order: number | null;
      // custom_label/custom_label_es folded into custom_label_i18n {en,es} (WS4).
      custom_label_i18n: Record<string, string | null> | null;
    }
  >();

  if (tenantId) {
    const svc = createServiceRoleClient();
    if (!svc) return [];
    const { data: settings, error: settingsError } = await svc
      .from("agency_taxonomy_settings")
      .select("taxonomy_term_id, is_enabled, show_in_directory, display_order, custom_label_i18n")
      .eq("tenant_id", tenantId);
    if (settingsError) return [];
    for (const setting of (settings ?? []) as Array<{
      taxonomy_term_id: string | null;
      is_enabled: boolean | null;
      show_in_directory: boolean | null;
      display_order: number | null;
      custom_label_i18n: Record<string, string | null> | null;
    }>) {
      if (!setting.taxonomy_term_id) continue;
      tenantSettings.set(setting.taxonomy_term_id, {
        is_enabled: setting.is_enabled,
        show_in_directory: setting.show_in_directory,
        display_order: setting.display_order,
        custom_label_i18n: setting.custom_label_i18n,
      });
    }
  }

  function visibleForTenant(row: { id: string; parent_id: string | null }): boolean {
    if (!tenantId) return true;
    let current: { id: string; parent_id: string | null } | undefined = row;
    let depth = 0;
    while (current && depth < 8) {
      const setting = tenantSettings.get(current.id);
      if (setting?.is_enabled === false || setting?.show_in_directory === false) {
        return false;
      }
      current = current.parent_id ? rowById.get(current.parent_id) : undefined;
      depth += 1;
    }
    return true;
  }

  return rows
    .filter((row) => row.is_active !== false)
    .filter(visibleForTenant)
    .map((row) => {
      const setting = tenantSettings.get(row.id);
      return {
        id: row.id,
        slug: row.slug,
        kind: row.kind,
        termType: row.term_type ?? null,
        parentId: row.parent_id ?? null,
        level: row.level ?? 1,
        isPublicFilter: Boolean(row.is_public_filter),
        isActive: true,
        searchSynonyms: Array.isArray(row.search_synonyms) ? row.search_synonyms : [],
        name:
          // tenant custom-label override (locale-aware, EN fallback), then the
          // term's own per-locale name. All read off the *_i18n maps (WS4).
          pickLocale(locale, {
            en: setting?.custom_label_i18n?.en?.trim(),
            es: setting?.custom_label_i18n?.es?.trim() || setting?.custom_label_i18n?.en?.trim(),
          }) ||
          pickLocale(locale, { en: row.name_i18n?.en, es: row.name_i18n?.es || undefined }) ||
          row.slug,
      };
    })
    .sort((a, b) => {
      const aRow = rowById.get(a.id);
      const bRow = rowById.get(b.id);
      const aOrder = tenantSettings.get(a.id)?.display_order ?? aRow?.sort_order ?? 100;
      const bOrder = tenantSettings.get(b.id)?.display_order ?? bRow?.sort_order ?? 100;
      return aOrder - bOrder || byName(a, b);
    });
}

export function getCachedTaxonomyFilterOptions(locale: string, tenantId: string | null = null) {
  const tenantKey = tenantId ?? "__hub__";
  return unstable_cache(
    () => loadTaxonomyTermsUncached(locale, tenantId),
    ["taxonomy-filter-options", locale, tenantKey],
    { tags: [CACHE_TAG_TAXONOMY], revalidate: 3600 },
  )();
}
