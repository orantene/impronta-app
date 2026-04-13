import { unstable_cache } from "next/cache";
import { CACHE_TAG_TAXONOMY } from "@/lib/cache-tags";
import { createPublicSupabaseClient } from "@/lib/supabase/public";

export type TaxonomyFilterOption = {
  id: string;
  slug: string;
  name: string;
  kind: string;
};

async function loadTaxonomyTermsUncached(
  locale: "en" | "es",
): Promise<TaxonomyFilterOption[]> {
  const supabase = createPublicSupabaseClient();
  if (!supabase) {
    return [];
  }
  const { data, error } = await supabase
    .from("taxonomy_terms")
    .select("id, slug, kind, name_en, name_es")
    .is("archived_at", null)
    .order("kind")
    .order("sort_order");

  if (error || !data) {
    return [];
  }

  return data.map((row) => ({
    id: row.id,
    slug: row.slug,
    kind: row.kind,
    name: locale === "es" && row.name_es ? row.name_es : row.name_en,
  }));
}

export function getCachedTaxonomyFilterOptions(locale: "en" | "es") {
  return unstable_cache(
    () => loadTaxonomyTermsUncached(locale),
    ["taxonomy-filter-options", locale],
    { tags: [CACHE_TAG_TAXONOMY], revalidate: 3600 },
  )();
}
