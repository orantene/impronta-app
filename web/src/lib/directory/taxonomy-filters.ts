import { unstable_cache } from "next/cache";
import { CACHE_TAG_TAXONOMY } from "@/lib/cache-tags";
import { createPublicSupabaseClient } from "@/lib/supabase/public";

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
): Promise<TaxonomyFilterOption[]> {
  const supabase = createPublicSupabaseClient();
  if (!supabase) {
    return [];
  }
  const { data, error } = await supabase
    .from("taxonomy_terms")
    .select(
      "id, slug, kind, term_type, parent_id, level, is_public_filter, is_active, search_synonyms, name_en, name_es",
    )
    .is("archived_at", null)
    .order("term_type", { nullsFirst: false })
    .order("kind")
    .order("sort_order");

  if (error || !data) {
    return [];
  }

  return data.map((row) => ({
    id: row.id,
    slug: row.slug,
    kind: row.kind,
    termType: row.term_type ?? null,
    parentId: row.parent_id ?? null,
    level: row.level ?? 1,
    isPublicFilter: Boolean(row.is_public_filter),
    isActive: row.is_active !== false,
    searchSynonyms: Array.isArray(row.search_synonyms) ? row.search_synonyms : [],
    name: locale === "es" && row.name_es ? row.name_es : row.name_en,
  }));
}

export function getCachedTaxonomyFilterOptions(locale: string) {
  return unstable_cache(
    () => loadTaxonomyTermsUncached(locale),
    ["taxonomy-filter-options", locale],
    { tags: [CACHE_TAG_TAXONOMY], revalidate: 3600 },
  )();
}
