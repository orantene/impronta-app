import type { SupabaseClient } from "@supabase/supabase-js";

import type { DirectoryCardDTO } from "@/lib/directory/types";
import { explainMatch } from "@/lib/ai/match-explain";
import type { SearchExplanationItem } from "@/lib/ai/search-result";
import { pickLocale } from "@/lib/i18n/pick-locale";

async function loadLocationQueryCity(
  supabase: SupabaseClient,
  locationSlug: string,
  locale: string,
): Promise<string | null> {
  const slug = locationSlug.trim();
  if (!slug) return null;
  // display_name_en/_es folded into display_name_i18n {en,es} (WS4 migration).
  const { data, error } = await supabase
    .from("locations")
    .select("display_name_i18n, city_slug")
    .eq("city_slug", slug)
    .maybeSingle();
  if (error || !data) return null;
  const row = data as {
    display_name_i18n: Record<string, string | null> | null;
    city_slug: string;
  };
  const i18n = row.display_name_i18n ?? {};
  return pickLocale(locale, { en: i18n.en?.trim() || i18n.es?.trim() || row.city_slug, es: i18n.es?.trim() || undefined });
}

async function loadTaxonomySlugSet(
  supabase: SupabaseClient,
  termIds: string[],
): Promise<Set<string>> {
  if (termIds.length === 0) return new Set();
  const { data, error } = await supabase
    .from("taxonomy_terms")
    .select("slug")
    .in("id", termIds);
  if (error || !data) return new Set();
  return new Set(
    (data as { slug: string }[]).map((r) => r.slug).filter(Boolean),
  );
}

/**
 * Rule-based explanations per card for `/api/ai/search` (Phase 11).
 */
export async function buildExplanationsForAiSearchCards(
  supabase: SupabaseClient,
  cards: DirectoryCardDTO[],
  opts: {
    locale: string;
    locationSlug: string;
    taxonomyTermIds: string[];
    heightMinCm: number | null;
    heightMaxCm: number | null;
    /** Same string as hybrid embedding / classic `q` (see `canonicalDirectoryQueryForAiSearch`). */
    canonicalQuery?: string;
    explanationsV2?: boolean;
  },
): Promise<Map<string, SearchExplanationItem[]>> {
  const [queryCity, slugSet] = await Promise.all([
    loadLocationQueryCity(supabase, opts.locationSlug, opts.locale),
    loadTaxonomySlugSet(supabase, opts.taxonomyTermIds),
  ]);

  const out = new Map<string, SearchExplanationItem[]>();
  for (const card of cards) {
    const sharedTaxonomyLabels = card.fitLabels
      .filter((f) => slugSet.has(f.slug))
      .map((f) => f.label)
      .filter(Boolean);
    const cardFitLabels = card.fitLabels.map((f) => f.label).filter(Boolean);
    const items = explainMatch({
      queryCity,
      profileCityLabel: card.locationLabel,
      heightCm: card.heightCm,
      heightMinCm: opts.heightMinCm,
      heightMaxCm: opts.heightMaxCm,
      sharedTaxonomyLabels,
      cardFitLabels,
      canonicalQuery: opts.canonicalQuery ?? "",
      primaryTalentTypeLabel: card.primaryTalentTypeLabel,
      explanationsV2: opts.explanationsV2,
    });
    out.set(card.id, items);
  }
  return out;
}
