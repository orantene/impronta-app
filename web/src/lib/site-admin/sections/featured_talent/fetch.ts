/**
 * Tenant-scoped fetch for featured_talent sections.
 *
 * Dispatches on `sourceMode`:
 *   - auto_featured_flag   → cached directory, sort='featured'
 *   - auto_recent          → cached directory, sort='recent'
 *   - auto_by_service      → direct query on `talent_profiles.service_category_slug`
 *   - auto_by_destination  → direct query on `talent_profiles.destinations` (text[])
 *   - manual_pick          → direct query by `profile_code IN (...)`, order-preserving
 *
 * Tenant scoping:
 *   Every path is gated by `agency_talent_roster` (status=active,
 *   agency_visibility in {site_visible,featured}) via RLS (for the cached
 *   directory path) or an explicit `id IN (rosterTalentIds)` filter (for the
 *   direct paths). Never returns rows outside the tenant's own roster.
 *
 * Returned shape is a trimmed subset of DirectoryCardDTO — only the fields
 * the homepage featured card actually renders. Larger payloads would waste
 * cache space for fields the card doesn't show.
 */
import { createPublicSupabaseClient } from "@/lib/supabase/public";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { getCachedDirectoryFirstPage } from "@/lib/directory/cache";
import { listTalentIdsOnTenantRoster } from "@/lib/saas/talent-roster";
import type { DirectoryCardDTO } from "@/lib/directory/types";
import {
  formatCityCountryLabel,
  resolveResidenceLocationEmbed,
  type CanonicalLocationEmbed,
} from "@/lib/canonical-location-display";
import { logServerError } from "@/lib/server/safe-error";
import { extractPrimaryRoleTerm, type ProfileTaxonomyRow } from "@/lib/taxonomy/engine";

import type { FeaturedTalentV1 } from "./schema";

/** Trimmed card shape consumed by FeaturedTalentCard (the presentational component). */
export type FeaturedTalentCardDTO = {
  id: string;
  profileCode: string;
  slugPart: string | null;
  displayName: string;
  primaryTalentTypeLabel: string;
  locationLabel: string;
  isFeatured: boolean;
  thumbnailUrl: string | null;
};

const FEATURED_LIMIT_MIN = 1;
const FEATURED_LIMIT_MAX = 12;

function clampLimit(n: number | undefined): number {
  const raw = typeof n === "number" && Number.isFinite(n) ? n : 6;
  return Math.max(FEATURED_LIMIT_MIN, Math.min(FEATURED_LIMIT_MAX, Math.trunc(raw)));
}

function projectDirectoryCard(c: DirectoryCardDTO): FeaturedTalentCardDTO {
  return {
    id: c.id,
    profileCode: c.profileCode,
    slugPart: c.slugPart,
    displayName: c.displayName,
    primaryTalentTypeLabel: c.primaryTalentTypeLabel,
    locationLabel: c.locationLabel,
    isFeatured: c.isFeatured,
    thumbnailUrl: c.thumbnail.url,
  };
}

/**
 * Entry point. Returns an ordered list of cards respecting `sourceMode`.
 * Always returns an array — empty on config gaps, fetch errors, or missing
 * required filter values. Never throws.
 */
export async function fetchFeaturedTalentForSection(
  tenantId: string,
  props: FeaturedTalentV1,
  locale: string,
): Promise<FeaturedTalentCardDTO[]> {
  if (!tenantId) return [];
  if (!isSupabaseConfigured()) return [];

  const limit = clampLimit(props.limit);
  const mode = props.sourceMode ?? "auto_featured_flag";

  try {
    switch (mode) {
      case "auto_featured_flag":
        return await fetchViaDirectoryCache(tenantId, "featured", limit, locale);
      case "auto_recent":
        return await fetchViaDirectoryCache(tenantId, "recent", limit, locale);
      case "auto_by_service":
        if (!props.filterServiceSlug?.trim()) return [];
        return await fetchByServiceCategory(
          tenantId,
          props.filterServiceSlug.trim(),
          limit,
          locale,
        );
      case "auto_by_destination":
        if (!props.filterDestinationSlug?.trim()) return [];
        return await fetchByDestination(
          tenantId,
          props.filterDestinationSlug.trim(),
          limit,
          locale,
        );
      case "manual_pick": {
        const codes = (props.manualProfileCodes ?? [])
          .map((c) => c?.trim())
          .filter((c): c is string => Boolean(c));
        if (codes.length === 0) return [];
        return await fetchByProfileCodes(tenantId, codes.slice(0, limit), locale);
      }
      default:
        return [];
    }
  } catch (error) {
    logServerError("featured_talent/fetch", error);
    return [];
  }
}

// ---------------------------------------------------------------------------
// Auto modes (featured / recent) — delegate to the cached directory path.
// ---------------------------------------------------------------------------

async function fetchViaDirectoryCache(
  tenantId: string,
  sort: "featured" | "recent",
  limit: number,
  locale: string,
): Promise<FeaturedTalentCardDTO[]> {
  const page = await getCachedDirectoryFirstPage({
    taxonomyTermIds: [],
    limit,
    locale,
    sort,
    tenantId,
  });
  return page.items.map(projectDirectoryCard);
}

// ---------------------------------------------------------------------------
// Direct queries — service category / destination / manual pick.
// ---------------------------------------------------------------------------

/**
 * Minimal row shape for the direct-query path. Kept narrow so Supabase returns
 * only what we need for the DTO.
 */
type FeaturedTalentRow = {
  id: string;
  profile_code: string;
  public_slug_part: string | null;
  display_name: string | null;
  is_featured: boolean;
  featured_level: number;
  featured_position: number;
  residence_city:
    | CanonicalLocationEmbed
    | CanonicalLocationEmbed[]
    | null;
  legacy_location:
    | CanonicalLocationEmbed
    | CanonicalLocationEmbed[]
    | null;
  talent_profile_taxonomy: ReadonlyArray<{
    is_primary: boolean;
    taxonomy_terms:
      | { kind: string; name_en: string; name_es: string | null }
      | { kind: string; name_en: string; name_es: string | null }[]
      | null;
  }> | null;
};

/** Select clause used by every direct-query path to keep DTO shaping uniform. */
const FEATURED_TALENT_SELECT = `
  id,
  profile_code,
  public_slug_part,
  display_name,
  is_featured,
  featured_level,
  featured_position,
  residence_city:locations!residence_city_id ( display_name_en, display_name_es, country_code ),
  legacy_location:locations!location_id ( display_name_en, display_name_es, country_code ),
  talent_profile_taxonomy (
    is_primary,
    taxonomy_terms ( kind, name_en, name_es )
  )
`;

async function fetchByServiceCategory(
  tenantId: string,
  serviceSlug: string,
  limit: number,
  locale: string,
): Promise<FeaturedTalentCardDTO[]> {
  const supabase = createPublicSupabaseClient();
  if (!supabase) return [];
  const roster = await listTalentIdsOnTenantRoster(supabase, tenantId);
  if (roster.length === 0) return [];

  const { data, error } = await supabase
    .from("talent_profiles")
    .select(FEATURED_TALENT_SELECT)
    .in("id", roster)
    .eq("workflow_status", "approved")
    .eq("visibility", "public")
    .eq("service_category_slug", serviceSlug)
    .is("deleted_at", null)
    .order("is_featured", { ascending: false })
    .order("featured_level", { ascending: false })
    .order("featured_position", { ascending: true })
    .order("updated_at", { ascending: false })
    .limit(limit);

  if (error) {
    logServerError("featured_talent/fetchByServiceCategory", error);
    return [];
  }
  return hydrateRows(supabase, (data ?? []) as FeaturedTalentRow[], locale);
}

async function fetchByDestination(
  tenantId: string,
  destinationSlug: string,
  limit: number,
  locale: string,
): Promise<FeaturedTalentCardDTO[]> {
  const supabase = createPublicSupabaseClient();
  if (!supabase) return [];
  const roster = await listTalentIdsOnTenantRoster(supabase, tenantId);
  if (roster.length === 0) return [];

  const { data, error } = await supabase
    .from("talent_profiles")
    .select(FEATURED_TALENT_SELECT)
    .in("id", roster)
    .eq("workflow_status", "approved")
    .eq("visibility", "public")
    .contains("destinations", [destinationSlug])
    .is("deleted_at", null)
    .order("is_featured", { ascending: false })
    .order("featured_level", { ascending: false })
    .order("featured_position", { ascending: true })
    .order("updated_at", { ascending: false })
    .limit(limit);

  if (error) {
    logServerError("featured_talent/fetchByDestination", error);
    return [];
  }
  return hydrateRows(supabase, (data ?? []) as FeaturedTalentRow[], locale);
}

async function fetchByProfileCodes(
  tenantId: string,
  codes: string[],
  locale: string,
): Promise<FeaturedTalentCardDTO[]> {
  const supabase = createPublicSupabaseClient();
  if (!supabase) return [];
  const roster = await listTalentIdsOnTenantRoster(supabase, tenantId);
  if (roster.length === 0) return [];

  const { data, error } = await supabase
    .from("talent_profiles")
    .select(FEATURED_TALENT_SELECT)
    .in("id", roster)
    .in("profile_code", codes)
    .eq("workflow_status", "approved")
    .eq("visibility", "public")
    .is("deleted_at", null);

  if (error) {
    logServerError("featured_talent/fetchByProfileCodes", error);
    return [];
  }

  // Preserve the admin's manual ordering. Any code that doesn't resolve
  // (archived, wrong tenant, misspelled) is silently dropped rather than
  // leaving a hole in the grid.
  const rowByCode = new Map<string, FeaturedTalentRow>();
  for (const row of (data ?? []) as FeaturedTalentRow[]) {
    rowByCode.set(row.profile_code, row);
  }
  const ordered = codes
    .map((c) => rowByCode.get(c))
    .filter((r): r is FeaturedTalentRow => Boolean(r));

  return hydrateRows(supabase, ordered, locale);
}

// ---------------------------------------------------------------------------
// Shared hydration: batch-fetch thumbnails + map to DTO.
// ---------------------------------------------------------------------------

type SupabaseClientType = ReturnType<typeof createPublicSupabaseClient>;

async function hydrateRows(
  supabase: NonNullable<SupabaseClientType>,
  rows: readonly FeaturedTalentRow[],
  locale: string,
): Promise<FeaturedTalentCardDTO[]> {
  if (rows.length === 0) return [];

  const ids = rows.map((r) => r.id);
  const thumbnailMap: Record<string, string> = {};

  const { data: mediaRows, error: mediaError } = await supabase
    .from("media_assets")
    .select("owner_talent_profile_id, storage_path, variant_kind, sort_order")
    .in("owner_talent_profile_id", ids)
    .eq("approval_state", "approved")
    .is("deleted_at", null)
    .in("variant_kind", ["card", "public_watermarked", "gallery"])
    .order("variant_kind")
    .order("sort_order");

  if (mediaError) {
    logServerError("featured_talent/hydrateRows/media", mediaError);
  } else {
    for (const row of mediaRows ?? []) {
      if (thumbnailMap[row.owner_talent_profile_id] || !row.storage_path) continue;
      const { data: urlData } = supabase.storage
        .from("media-public")
        .getPublicUrl(row.storage_path);
      if (urlData?.publicUrl) {
        thumbnailMap[row.owner_talent_profile_id] = urlData.publicUrl;
      }
    }
  }

  return rows.map((row) => {
    // Engine-driven primary role extraction (handles v2 + legacy shapes).
    const taxonomy = (row.talent_profile_taxonomy ?? []) as ProfileTaxonomyRow[];
    const primary = extractPrimaryRoleTerm(taxonomy);
    const typeLabel = primary
      ? ((locale === "es" && primary.name_es) || primary.name_en || "Talent")
      : "Talent";

    const residence = resolveResidenceLocationEmbed({
      residence_city: row.residence_city ?? null,
      legacy_location: row.legacy_location ?? null,
    });
    const locationLabel = formatCityCountryLabel(locale, residence);

    return {
      id: row.id,
      profileCode: row.profile_code,
      slugPart: row.public_slug_part,
      displayName: row.display_name ?? "Talent",
      primaryTalentTypeLabel: typeLabel,
      locationLabel,
      isFeatured: row.is_featured,
      thumbnailUrl: thumbnailMap[row.id] ?? null,
    };
  });
}
