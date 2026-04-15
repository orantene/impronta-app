import { createHash } from "node:crypto";

import type {
  DirectoryFieldFacetSelection,
  DirectorySortValue,
} from "@/lib/directory/types";

function stableFieldFacetsJson(
  facets: DirectoryFieldFacetSelection[] | undefined,
): { k: string; v: string[] }[] | undefined {
  if (!facets?.length) return undefined;
  const rows = [...facets]
    .map((f) => ({
      k: f.fieldKey.trim(),
      v: [...new Set(f.values.map((x) => x.trim()).filter(Boolean))].sort(),
    }))
    .filter((x) => x.k && x.v.length)
    .sort((a, b) => a.k.localeCompare(b.k));
  return rows.length ? rows : undefined;
}

/**
 * Stable fingerprint for hybrid continuation cursors: same search intent must match
 * page 2+ requests or we drop the cursor (prevents offset drift when filters change).
 */
export function computeHybridContextStamp(parts: {
  canonicalQuery: string;
  taxonomyTermIds: string[];
  locationSlug: string;
  sort: DirectorySortValue;
  heightMinCm: number | null;
  heightMaxCm: number | null;
  ageMin?: number | null;
  ageMax?: number | null;
  fieldFacetFilters?: DirectoryFieldFacetSelection[];
}): string {
  const base = {
    q: parts.canonicalQuery,
    t: [...parts.taxonomyTermIds].map((id) => id.toLowerCase()).sort(),
    l: parts.locationSlug.trim().toLowerCase(),
    s: parts.sort,
    hmin: parts.heightMinCm,
    hmax: parts.heightMaxCm,
    amin: parts.ageMin ?? null,
    amax: parts.ageMax ?? null,
  };
  const ff = stableFieldFacetsJson(parts.fieldFacetFilters);
  const payload = JSON.stringify(ff?.length ? { ...base, ff } : base);
  return createHash("sha256").update(payload).digest("base64url").slice(0, 16);
}
