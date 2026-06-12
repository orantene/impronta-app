import { unstable_cache } from "next/cache";
import { CACHE_TAG_DIRECTORY } from "@/lib/cache-tags";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { createPublicSupabaseClient } from "@/lib/supabase/public";
import { readDirectoryCardCatalog } from "@/lib/field-engine/read-source-directory-cards";

export type DirectoryCardScalarDef = {
  id: string;
  key: string;
  value_type: string;
  taxonomy_kind: string | null;
  sort_order: number;
  label_en: string;
  label_es: string | null;
};

export type DirectoryCardDisplayCatalog = {
  /** Fit-label chips when `fit_labels` passes the same visibility stack as other card traits. */
  fitLabelsEnabled: boolean;
  /** `height_cm` uses `talent_profiles.height_cm` when this definition is card-eligible. */
  heightCardDef: DirectoryCardScalarDef | null;
  /** Dynamic lines: card-visible scalars except `fit_labels` and `height_cm`. */
  scalarCardDefs: DirectoryCardScalarDef[];
};

type DirectoryCardDisplayCatalogOptions = {
  tenantId?: string | null;
};

/** Cached field catalog for directory cards — invalidated with `CACHE_TAG_DIRECTORY`.
 *
 *  T2.4 → T3.2b: the load is dispatched through the `directory_cards` read-source
 *  seam (`read-source-directory-cards.ts`), which now reads canonical System B
 *  (`profile_field_definitions`) ONLY. The legacy System A `field_definitions`
 *  reader was deleted; the structural metadata B does not carry (taxonomy_kind, A
 *  sort_order, A def-id) comes from the frozen directory catalog registry. The
 *  `directory_cards` flag no longer switches stores.
 */
export function getCachedDirectoryCardDisplayCatalog(
  opts: DirectoryCardDisplayCatalogOptions = {},
): Promise<DirectoryCardDisplayCatalog> {
  const tenantId = opts.tenantId ?? null;
  const cacheKey = tenantId
    ? `directory-card-display-catalog-v4:${tenantId}`
    : "directory-card-display-catalog-v4:canonical";
  const publicSupabase = createPublicSupabaseClient();
  const supabase = createServiceRoleClient() ?? publicSupabase;
  return unstable_cache(
    () => readDirectoryCardCatalog(supabase, { tenantId }),
    [cacheKey],
    { tags: [CACHE_TAG_DIRECTORY], revalidate: 120 },
  )();
}
