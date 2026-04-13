import { unstable_cache } from "next/cache";
import { CACHE_TAG_DIRECTORY } from "@/lib/cache-tags";
import { fetchDirectoryPage } from "@/lib/directory/fetch-directory-page";
import type { DirectoryPageResponse } from "@/lib/directory/types";
import { DIRECTORY_PAGE_SIZE_DEFAULT } from "@/lib/directory/types";
import { createPublicSupabaseClient } from "@/lib/supabase/public";

function taxonomyCacheKey(ids: string[]): string {
  return [...ids].sort().join(",") || "all";
}

/** Server-cached first page for RSC (anon client — no request cookies). */
export function getCachedDirectoryFirstPage(options: {
  taxonomyTermIds: string[];
  limit?: number;
  locale?: "en" | "es";
  query?: string;
  locationSlug?: string;
  sort?: "recommended" | "featured" | "recent" | "updated";
  heightMinCm?: number | null;
  heightMaxCm?: number | null;
}): Promise<DirectoryPageResponse> {
  const key = taxonomyCacheKey(options.taxonomyTermIds);
  const limit = options.limit ?? DIRECTORY_PAGE_SIZE_DEFAULT;
  const locale = options.locale ?? "en";
  const query = options.query?.trim() ?? "";
  const locationSlug = options.locationSlug?.trim() ?? "";
  const sort = options.sort ?? "recommended";
  const hMin = options.heightMinCm ?? null;
  const hMax = options.heightMaxCm ?? null;

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
    ],
    { tags: [CACHE_TAG_DIRECTORY], revalidate: 120 },
  )();
}
