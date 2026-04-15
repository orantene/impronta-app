import { unstable_cache } from "next/cache";
import { CACHE_TAG_DIRECTORY } from "@/lib/cache-tags";
import { fetchDirectoryPage } from "@/lib/directory/fetch-directory-page";
import type { DirectoryFieldFacetSelection, DirectoryPageResponse } from "@/lib/directory/types";
import { DIRECTORY_PAGE_SIZE_DEFAULT } from "@/lib/directory/types";
import { createPublicSupabaseClient } from "@/lib/supabase/public";
import { getAiFeatureFlags } from "@/lib/settings/ai-feature-flags";
import { getPublicSettings } from "@/lib/public-settings";
import { runAiDirectorySearch } from "@/lib/ai/run-ai-directory-search";
import { buildDirectoryAiOverlayByTalentId } from "@/lib/directory/directory-ai-overlay";

function taxonomyCacheKey(ids: string[]): string {
  return [...ids].sort().join(",") || "all";
}

/** Server-cached first page for RSC (anon client — no request cookies). */
function fieldFacetCacheKey(facets: DirectoryFieldFacetSelection[] | undefined): string {
  if (!facets?.length) return "";
  return JSON.stringify(
    [...facets]
      .map((f) => ({
        k: f.fieldKey.trim(),
        v: [...new Set(f.values.map((x) => x.trim()).filter(Boolean))].sort(),
      }))
      .filter((x) => x.k && x.v.length)
      .sort((a, b) => a.k.localeCompare(b.k)),
  );
}

export function getCachedDirectoryFirstPage(options: {
  taxonomyTermIds: string[];
  limit?: number;
  locale?: string;
  query?: string;
  locationSlug?: string;
  sort?: "recommended" | "featured" | "recent" | "updated";
  heightMinCm?: number | null;
  heightMaxCm?: number | null;
  ageMin?: number | null;
  ageMax?: number | null;
  fieldFacetFilters?: DirectoryFieldFacetSelection[];
}): Promise<DirectoryPageResponse> {
  const key = taxonomyCacheKey(options.taxonomyTermIds);
  const limit = options.limit ?? DIRECTORY_PAGE_SIZE_DEFAULT;
  const locale = options.locale ?? "en";
  const query = options.query?.trim() ?? "";
  const locationSlug = options.locationSlug?.trim() ?? "";
  const sort = options.sort ?? "recommended";
  const hMin = options.heightMinCm ?? null;
  const hMax = options.heightMaxCm ?? null;
  const aMin = options.ageMin ?? null;
  const aMax = options.ageMax ?? null;
  const ffKey = fieldFacetCacheKey(options.fieldFacetFilters);

  return unstable_cache(
    async () => {
      const supabase = createPublicSupabaseClient();
      if (!supabase) {
        return {
          items: [],
          nextCursor: null,
          totalCount: 0,
          taxonomyTermIds: options.taxonomyTermIds,
        };
      }
      return fetchDirectoryPage(supabase, {
        limit,
        taxonomyTermIds: options.taxonomyTermIds,
        locale,
        query,
        locationSlug,
        sort,
        heightMinCm: hMin,
        heightMaxCm: hMax,
        ageMin: aMin,
        ageMax: aMax,
        fieldFacetFilters: options.fieldFacetFilters,
      });
    },
    [
      "directory-first",
      key,
      String(limit),
      locale,
      query,
      locationSlug,
      sort,
      String(hMin ?? ""),
      String(hMax ?? ""),
      String(aMin ?? ""),
      String(aMax ?? ""),
      ffKey,
    ],
    { tags: [CACHE_TAG_DIRECTORY], revalidate: 120 },
  )();
}

/**
 * First directory page for RSC: uses hybrid `/api/ai/search` logic when `ai_search_enabled`
 * (uncached — vectors + flags), otherwise cached classic `fetchDirectoryPage`.
 */
export async function getPublicDirectoryFirstPage(options: {
  taxonomyTermIds: string[];
  limit?: number;
  locale?: string;
  query?: string;
  locationSlug?: string;
  sort?: "recommended" | "featured" | "recent" | "updated";
  heightMinCm?: number | null;
  heightMaxCm?: number | null;
  ageMin?: number | null;
  ageMax?: number | null;
  fieldFacetFilters?: DirectoryFieldFacetSelection[];
}): Promise<DirectoryPageResponse> {
  const flags = await getAiFeatureFlags();
  if (!flags.ai_master_enabled || !flags.ai_search_enabled) {
    return getCachedDirectoryFirstPage(options);
  }

  const publicSettings = await getPublicSettings();
  if (!publicSettings.directoryPublic) {
    return {
      items: [],
      nextCursor: null,
      totalCount: 0,
      taxonomyTermIds: options.taxonomyTermIds,
    };
  }

  const limit = options.limit ?? DIRECTORY_PAGE_SIZE_DEFAULT;
  const locale = options.locale ?? "en";
  const sort = options.sort ?? "recommended";

  const out = await runAiDirectorySearch({
    rawQ: options.query,
    taxonomyTermIds: options.taxonomyTermIds,
    locationSlug: options.locationSlug,
    sortRaw: sort,
    locale,
    limit,
    heightMinCm: options.heightMinCm ?? null,
    heightMaxCm: options.heightMaxCm ?? null,
    ageMin: options.ageMin ?? null,
    ageMax: options.ageMax ?? null,
    fieldFacetFilters: options.fieldFacetFilters,
    cursor: null,
    includeTotalCount: true,
    logAnalytics: false,
    analyticsSource: "directory",
  });

  const aiOverlayByTalentId = buildDirectoryAiOverlayByTalentId(
    out.results,
    locale,
  );

  return {
    items: out.results.map((r) => r.card),
    nextCursor: out.next_cursor,
    ...(out.total_count != null ? { totalCount: out.total_count } : {}),
    taxonomyTermIds: out.taxonomy_term_ids,
    ...(aiOverlayByTalentId ? { aiOverlayByTalentId } : {}),
  };
}
