import type { SupabaseClient } from "@supabase/supabase-js";
import {
  decodeDirectoryCursor,
  encodeDirectoryCursor,
} from "@/lib/directory/cursor";
import { buildCardAttributesForProfile } from "@/lib/directory/build-card-attributes-for-profile";
import type { ProfileTaxonomyTerm } from "@/lib/directory/format-card-attribute-value";
import { getCachedDirectoryCardDisplayCatalog } from "@/lib/directory/directory-card-display-catalog";
import {
  clampHeightRangeToCatalog,
  getCachedDirectoryHeightFilterConfig,
} from "@/lib/directory/directory-filter-catalog";
import type { FieldValueRow } from "@/lib/directory/format-card-attribute-value";
import { mapApiDirectoryRpcRowToDirectoryCardDTO } from "@/lib/directory/talent-card-dto";
import type { ApiDirectoryCardRpcRow } from "@/lib/directory/talent-card-dto";
import { fetchLegacyDirectorySearchTalentIds } from "@/lib/directory/directory-search-legacy";
import {
  directorySearchForceLegacy,
  isDirectorySearchRpcUnavailableError,
} from "@/lib/directory/directory-search-rpc";
import type {
  DirectoryListParams,
  DirectoryPageResponse,
  DirectorySortValue,
} from "@/lib/directory/types";
import {
  DIRECTORY_PAGE_SIZE_DEFAULT,
  DIRECTORY_PAGE_SIZE_MAX,
} from "@/lib/directory/types";
import { logServerError } from "@/lib/server/safe-error";
import { improntaLog } from "@/lib/server/structured-log";
import { auditTime, isDirectoryApiAudit } from "@/lib/directory/directory-api-audit";
import {
  applyDirectoryFieldFacetFilters,
  loadDirectoryFacetDefinitionsByKey,
} from "@/lib/directory/apply-directory-field-facet-filters";

/**
 * Directory `q`: primary path is Postgres RPC `directory_search_public_talent_ids` (FTS + ILIKE + similarity).
 *
 * Rollout safety: if the RPC is missing (or `DIRECTORY_SEARCH_FORCE_LEGACY=1`), we fall back once to the
 * legacy multi-query search and log clearly. Remove the fallback after the migration is everywhere.
 *
 * Result order: `q` only filters candidate profile ids; listing order is entirely `applySort` on
 * `talent_profiles` with an `id` tie-break, so offset cursors stay stable for fixed filters + sort
 * (no FTS rank mixed into pagination).
 */

type LocationRow = {
  id: string;
  city_slug: string;
  display_name_en: string;
  display_name_es: string | null;
  country_code: string;
};

type TalentProfileRow = {
  id: string;
  profile_code: string;
  public_slug_part: string | null;
  display_name: string | null;
  first_name: string | null;
  last_name: string | null;
  created_at: string;
  updated_at: string;
  is_featured: boolean;
  featured_level: number;
  featured_position: number;
  profile_completeness_score: number | string | null;
  manual_rank_override: number | null;
  height_cm: number | null;
  location_id: string | null;
  residence_city: LocationRow | LocationRow[] | null;
  legacy_location: LocationRow | LocationRow[] | null;
};

type TaxonomyTermNested = {
  id: string;
  kind: string;
  slug: string;
  name_en: string;
  name_es: string | null;
  sort_order: number;
};

type TaxonomyAssignmentRow = {
  talent_profile_id: string;
  is_primary: boolean;
  taxonomy_terms: TaxonomyTermNested | TaxonomyTermNested[] | null;
};

type MediaRow = {
  owner_talent_profile_id: string;
  width: number | null;
  height: number | null;
  bucket_id: string | null;
  storage_path: string | null;
  variant_kind: string;
  sort_order: number;
  created_at: string;
};

function cardResidenceLocation(profile: TalentProfileRow): LocationRow | null {
  const pick = (value: LocationRow | LocationRow[] | null): LocationRow | null =>
    Array.isArray(value) ? (value[0] ?? null) : value;
  return pick(profile.residence_city) ?? pick(profile.legacy_location);
}

function pickLocalizedTermName(
  loc: string,
  en: string | null,
  es: string | null,
): string {
  if (loc === "es" && es?.trim()) return es.trim();
  if (en?.trim()) return en.trim();
  if (es?.trim()) return es.trim();
  return "";
}

function buildClassicFilterMatchLabels(
  locale: string,
  locationSlug: string,
  taxonomyTermIds: string[],
  termMetaById: Map<string, { kind: string; slug: string; label: string }>,
  profileTermIds: Set<string>,
  residence: LocationRow | null,
): string[] {
  const labels: string[] = [];
  const seen = new Set<string>();

  if (locationSlug && residence?.city_slug === locationSlug) {
    const cityLabel =
      pickLocalizedTermName(
        locale,
        residence.display_name_en,
        residence.display_name_es,
      ) || residence.city_slug;
    const line =
      locale === "es" ? `En ${cityLabel}` : `${cityLabel} based`;
    labels.push(line);
    seen.add(line.toLowerCase());
  }

  for (const tid of taxonomyTermIds) {
    if (!profileTermIds.has(tid)) continue;
    const meta = termMetaById.get(tid);
    if (!meta) continue;
    if (meta.kind === "location_city" && locationSlug && meta.slug === locationSlug) {
      continue;
    }
    if (meta.kind === "location_country") continue;
    const lab = meta.label;
    if (!lab || seen.has(lab.toLowerCase())) continue;
    seen.add(lab.toLowerCase());
    labels.push(lab);
    if (labels.length >= 6) break;
  }

  return labels;
}

function orResidenceOrLegacyLocationMatches(locationIds: string[]): string {
  const list = locationIds.join(",");
  return `residence_city_id.in.(${list}),location_id.in.(${list})`;
}

function orResidenceOrLegacyLocationEq(locationId: string): string {
  return `residence_city_id.eq.${locationId},location_id.eq.${locationId}`;
}

function uniqueIds(rows: { talent_profile_id: string }[]): string[] {
  return [...new Set(rows.map((row) => row.talent_profile_id))];
}

function intersectSortedIds(sets: string[][]): string[] {
  if (sets.length === 0) return [];
  let acc = new Set(sets[0]);
  for (let i = 1; i < sets.length; i++) {
    const next = new Set(sets[i]);
    acc = new Set([...acc].filter((id) => next.has(id)));
  }
  return [...acc];
}

function applySort<T extends { order: (column: string, options?: { ascending?: boolean }) => T }>(
  query: T,
  sort: DirectorySortValue,
): T {
  if (sort === "featured") {
    return query
      .order("is_featured", { ascending: false })
      .order("featured_level", { ascending: false })
      .order("featured_position", { ascending: true })
      .order("updated_at", { ascending: false })
      .order("id", { ascending: false });
  }

  if (sort === "recent") {
    return query.order("created_at", { ascending: false }).order("id", {
      ascending: false,
    });
  }

  if (sort === "updated") {
    return query.order("updated_at", { ascending: false }).order("id", {
      ascending: false,
    });
  }

  return query
    .order("is_featured", { ascending: false })
    .order("featured_level", { ascending: false })
    .order("featured_position", { ascending: true })
    .order("updated_at", { ascending: false })
    .order("created_at", { ascending: false })
    .order("id", { ascending: false });
}

export async function fetchDirectoryPage(
  supabase: SupabaseClient,
  params: DirectoryListParams = {},
): Promise<DirectoryPageResponse> {
  const audit = isDirectoryApiAudit();
  const timings: Record<string, number> = {};
  const wallStart = performance.now();

  const limit = Math.min(
    Math.max(params.limit ?? DIRECTORY_PAGE_SIZE_DEFAULT, 1),
    DIRECTORY_PAGE_SIZE_MAX,
  );
  const taxonomyTermIds = params.taxonomyTermIds?.filter(Boolean) ?? [];
  const locale = params.locale ?? "en";
  const sort = params.sort ?? "recommended";
  const queryText = params.query?.trim() ?? "";
  const locationSlug = params.locationSlug?.trim() ?? "";
  const offset = params.cursor
    ? (decodeDirectoryCursor(params.cursor)?.offset ?? 0)
    : 0;
  const skipTotalCount = params.skipTotalCount ?? offset > 0;

  const [{ fitLabelsEnabled, heightCardDef, scalarCardDefs }, heightFilterCatalog] =
    await auditTime(audit, timings, "catalogParallelMs", () =>
      Promise.all([
        getCachedDirectoryCardDisplayCatalog(),
        getCachedDirectoryHeightFilterConfig(),
      ]),
    );

  const { minCm: heightMinApplied, maxCm: heightMaxApplied } = clampHeightRangeToCatalog(
    params.heightMinCm ?? null,
    params.heightMaxCm ?? null,
    heightFilterCatalog,
  );
  const heightFilterActive =
    heightFilterCatalog.enabled && (heightMinApplied != null || heightMaxApplied != null);

  let locationId: string | null = null;
  if (locationSlug) {
    const { data: locationRow, error: locationError } = await auditTime(
      audit,
      timings,
      "locationSlugResolveMs",
      () =>
        supabase
          .from("locations")
          .select("id")
          .eq("city_slug", locationSlug)
          .is("archived_at", null)
          .maybeSingle(),
    );

    if (locationError || !locationRow) {
      return { items: [], nextCursor: null, totalCount: 0, taxonomyTermIds };
    }

    locationId = locationRow.id;
  }

  // Support location taxonomy terms (`location_city`/`location_country`) without requiring
  // them to be assigned via talent_profile_taxonomy.
  const locationTaxonomy: { citySlugs: string[]; countrySlugs: string[] } = {
    citySlugs: [],
    countrySlugs: [],
  };
  /** Non-location taxonomy kinds → selected term UUIDs (OR within kind, AND across kinds). */
  const taxonomyByKind = new Map<string, string[]>();
  let termMetaById = new Map<
    string,
    { kind: string; slug: string; label: string }
  >();
  if (taxonomyTermIds.length > 0) {
    const { data: termRows, error: termErr } = await auditTime(
      audit,
      timings,
      "taxonomyTermsResolveMs",
      () =>
        supabase
          .from("taxonomy_terms")
          .select("id, kind, slug, name_en, name_es")
          .in("id", taxonomyTermIds)
          .is("archived_at", null),
    );

    if (termErr) {
      throw new Error(`[directory] taxonomy term lookup: ${termErr.message}`);
    }

    const nextMeta = new Map<
      string,
      { kind: string; slug: string; label: string }
    >();
    for (const row of (termRows ?? []) as {
      id: string;
      kind: string;
      slug: string;
      name_en: string;
      name_es: string | null;
    }[]) {
      nextMeta.set(row.id, {
        kind: row.kind,
        slug: row.slug,
        label: pickLocalizedTermName(locale, row.name_en, row.name_es),
      });
      if (row.kind === "location_city") locationTaxonomy.citySlugs.push(row.slug);
      else if (row.kind === "location_country") locationTaxonomy.countrySlugs.push(row.slug);
      else {
        const arr = taxonomyByKind.get(row.kind) ?? [];
        arr.push(row.id);
        taxonomyByKind.set(row.kind, arr);
      }
    }
    termMetaById = nextMeta;

    if (taxonomyTermIds.length > 0 && (termRows?.length ?? 0) === 0) {
      return { items: [], nextCursor: null, totalCount: 0, taxonomyTermIds };
    }
  }

  let locationTaxonomyTalentIds: string[] | null = null;
  if (locationTaxonomy.citySlugs.length > 0 || locationTaxonomy.countrySlugs.length > 0) {
    let locationLookup = supabase.from("locations").select("id").is("archived_at", null);
    if (locationTaxonomy.citySlugs.length > 0) {
      locationLookup = locationLookup.in("city_slug", locationTaxonomy.citySlugs);
    }
    if (locationTaxonomy.countrySlugs.length > 0) {
      locationLookup = locationLookup.in(
        "country_code",
        locationTaxonomy.countrySlugs.map((s) => s.toUpperCase()),
      );
    }
    const { data: locationRows, error: locErr } = await auditTime(
      audit,
      timings,
      "locationTaxonomyLocationsMs",
      () => locationLookup,
    );
    if (locErr) {
      throw new Error(`[directory] location taxonomy lookup: ${locErr.message}`);
    }
    const locIds = ((locationRows ?? []) as { id: string }[]).map((r) => r.id);
    if (locIds.length === 0) {
      return { items: [], nextCursor: null, totalCount: 0, taxonomyTermIds };
    }
    const { data: locTalentRows, error: locTalentErr } = await auditTime(
      audit,
      timings,
      "locationTaxonomyTalentsMs",
      () =>
        supabase
          .from("talent_profiles")
          .select("id")
          .is("deleted_at", null)
          .eq("workflow_status", "approved")
          .eq("visibility", "public")
          .or(orResidenceOrLegacyLocationMatches(locIds)),
    );
    if (locTalentErr) {
      throw new Error(`[directory] location taxonomy talent: ${locTalentErr.message}`);
    }
    locationTaxonomyTalentIds = ((locTalentRows ?? []) as { id: string }[]).map((r) => r.id);
    if (locationTaxonomyTalentIds.length === 0) {
      return { items: [], nextCursor: null, totalCount: 0, taxonomyTermIds };
    }
  }

  let filteredTalentIds: string[] | null = null;
  if (taxonomyByKind.size > 0) {
    const perKindSets: string[][] = [];
    for (const [, termIds] of taxonomyByKind) {
      if (termIds.length === 0) continue;
      const { data: taxonomyRows, error: taxonomyError } = await auditTime(
        audit,
        timings,
        "taxonomyProfileFilterMs",
        () =>
          supabase
            .from("talent_profile_taxonomy")
            .select("talent_profile_id")
            .in("taxonomy_term_id", termIds),
      );

      if (taxonomyError) {
        throw new Error(`[directory] taxonomy filter: ${taxonomyError.message}`);
      }

      const ids = uniqueIds((taxonomyRows ?? []) as { talent_profile_id: string }[]);
      if (ids.length === 0) {
        return { items: [], nextCursor: null, totalCount: 0, taxonomyTermIds };
      }
      perKindSets.push(ids);
    }
    filteredTalentIds = intersectSortedIds(perKindSets);
    if (filteredTalentIds.length === 0) {
      return { items: [], nextCursor: null, totalCount: 0, taxonomyTermIds };
    }
  }

  if (locationTaxonomyTalentIds) {
    filteredTalentIds = filteredTalentIds
      ? filteredTalentIds.filter((id) => locationTaxonomyTalentIds.includes(id))
      : locationTaxonomyTalentIds;
  }

  if (queryText) {
    let searchIds: string[];

    if (directorySearchForceLegacy()) {
      logServerError(
        "directory/search-force-legacy-env",
        new Error("DIRECTORY_SEARCH_FORCE_LEGACY=1 — using legacy directory search"),
      );
      void improntaLog("directory_search_path", { path: "legacy", reason: "force_env" });
      searchIds = await auditTime(audit, timings, "searchLegacyMs", () =>
        fetchLegacyDirectorySearchTalentIds(supabase, queryText),
      );
    } else {
      const { data: rpcData, error: rpcError } = await auditTime(
        audit,
        timings,
        "searchRpcMs",
        () =>
          supabase.rpc("directory_search_public_talent_ids", {
            p_query: queryText.trim(),
          }),
      );

      if (rpcError && isDirectorySearchRpcUnavailableError(rpcError)) {
        logServerError("directory/search-rpc-unavailable-fallback", rpcError);
        void improntaLog("directory_search_path", { path: "legacy", reason: "rpc_unavailable" });
        searchIds = await auditTime(audit, timings, "searchLegacyMs", () =>
          fetchLegacyDirectorySearchTalentIds(supabase, queryText),
        );
      } else if (rpcError) {
        throw new Error(`[directory] search rpc: ${rpcError.message}`);
      } else {
        searchIds = (rpcData ?? []) as string[];
      }
    }

    const searchSet = new Set(searchIds);
    filteredTalentIds = filteredTalentIds
      ? filteredTalentIds.filter((id) => searchSet.has(id))
      : searchIds;

    if (filteredTalentIds.length === 0) {
      return { items: [], nextCursor: null, totalCount: 0, taxonomyTermIds };
    }
  }

  const fieldFacetFilters =
    params.fieldFacetFilters?.filter((f) => f.fieldKey.trim() && f.values.some((v) => v.trim())) ?? [];
  if (fieldFacetFilters.length > 0) {
    const facetKeys = fieldFacetFilters.map((f) => f.fieldKey);
    const defsByKey = await auditTime(audit, timings, "facetDefinitionsMs", () =>
      loadDirectoryFacetDefinitionsByKey(supabase, facetKeys),
    );
    const facetOutcome = await auditTime(audit, timings, "scalarFacetFilterMs", () =>
      applyDirectoryFieldFacetFilters(supabase, fieldFacetFilters, defsByKey, {
        locationId,
        heightFilterActive,
        heightMinApplied,
        heightMaxApplied,
        orResidenceOrLegacyLocationEq,
        filteredTalentIds,
      }),
    );
    if (facetOutcome.isEmpty) {
      return { items: [], nextCursor: null, totalCount: 0, taxonomyTermIds };
    }
    filteredTalentIds = facetOutcome.filteredTalentIds;
  }

  let totalCount: number | undefined;
  if (!skipTotalCount) {
    let countQuery = supabase
      .from("talent_profiles")
      .select("id", { count: "exact", head: true })
      .is("deleted_at", null)
      .eq("workflow_status", "approved")
      .eq("visibility", "public");

    if (locationId) {
      countQuery = countQuery.or(orResidenceOrLegacyLocationEq(locationId));
    }

    if (heightFilterActive) {
      if (heightMinApplied != null) countQuery = countQuery.gte("height_cm", heightMinApplied);
      if (heightMaxApplied != null) countQuery = countQuery.lte("height_cm", heightMaxApplied);
    }

    if (params.ageMin != null || params.ageMax != null) {
      const today = new Date();
      const year = today.getFullYear();
      const month = today.getMonth();
      const day = today.getDate();
      if (params.ageMin != null) {
        const dobMax = new Date(year - params.ageMin, month, day).toISOString().slice(0, 10);
        countQuery = countQuery.lte("date_of_birth", dobMax);
      }
      if (params.ageMax != null) {
        const dobMin = new Date(year - params.ageMax, month, day).toISOString().slice(0, 10);
        countQuery = countQuery.gte("date_of_birth", dobMin);
      }
    }

    if (filteredTalentIds) {
      countQuery = countQuery.in("id", filteredTalentIds);
    }

    const { count: totalCountRaw, error: countError } = await auditTime(
      audit,
      timings,
      "countQueryMs",
      () => countQuery,
    );
    if (countError) {
      throw new Error(`[directory] count: ${countError.message}`);
    }

    totalCount = totalCountRaw ?? 0;
  }

  let query = supabase
    .from("talent_profiles")
    .select(
      `
      id,
      profile_code,
      public_slug_part,
      display_name,
      first_name,
      last_name,
      created_at,
      updated_at,
      is_featured,
      featured_level,
      featured_position,
      profile_completeness_score,
      manual_rank_override,
      height_cm,
      location_id,
      residence_city:locations!residence_city_id (
        id,
        city_slug,
        display_name_en,
        display_name_es,
        country_code
      ),
      legacy_location:locations!location_id (
        id,
        city_slug,
        display_name_en,
        display_name_es,
        country_code
      )
    `,
    )
    .is("deleted_at", null)
    .eq("workflow_status", "approved")
    .eq("visibility", "public");

  if (locationId) {
    query = query.or(orResidenceOrLegacyLocationEq(locationId));
  }

  if (heightFilterActive) {
    if (heightMinApplied != null) query = query.gte("height_cm", heightMinApplied);
    if (heightMaxApplied != null) query = query.lte("height_cm", heightMaxApplied);
  }

  // Age filter: convert age range to date_of_birth range
  if (params.ageMin != null || params.ageMax != null) {
    const today = new Date();
    const year = today.getFullYear();
    const month = today.getMonth();
    const day = today.getDate();
    if (params.ageMin != null) {
      // Min age → born on or before this date (older end)
      const dobMax = new Date(year - params.ageMin, month, day).toISOString().slice(0, 10);
      query = query.lte("date_of_birth", dobMax);
    }
    if (params.ageMax != null) {
      // Max age → born on or after this date (younger end)
      const dobMin = new Date(year - params.ageMax, month, day).toISOString().slice(0, 10);
      query = query.gte("date_of_birth", dobMin);
    }
  }

  if (filteredTalentIds) {
    query = query.in("id", filteredTalentIds);
  }

  // Stable ordering: sort columns + id tie-break; search does not affect order within the filtered set.
  query = applySort(query, sort).range(offset, offset + limit - 1);

  const { data: profileRows, error } = await auditTime(
    audit,
    timings,
    "mainListingMs",
    () => query,
  );

  if (error) {
    throw new Error(`[directory] talent_profiles: ${error.message}`);
  }

  const profiles = (profileRows ?? []) as TalentProfileRow[];
  const profileIds = profiles.map((row) => row.id);

  if (profileIds.length === 0) {
    if (audit) {
      timings.wallTotalMs = performance.now() - wallStart;
      console.log(
        JSON.stringify({
          event: "directory_fetch_directory_page",
          timings,
          note: "empty_profile_page",
          limit,
          sort,
          offset,
          hasQuery: queryText.length > 0,
          hasLocationSlug: locationSlug.length > 0,
          taxonomyTermIdsCount: taxonomyTermIds.length,
        }),
      );
    }
    return {
      items: [],
      nextCursor: null,
      ...(totalCount !== undefined ? { totalCount } : {}),
      taxonomyTermIds,
    };
  }

  const cardDefinitionIds = scalarCardDefs.map((d) => d.id);
  const valuesByProfileId = new Map<string, Map<string, FieldValueRow>>();
  const termsById = new Map<string, { name_en: string; name_es: string | null }>();

  if (cardDefinitionIds.length > 0) {
    const { data: fvRows, error: fvErr } = await auditTime(
      audit,
      timings,
      "fieldValuesMs",
      () =>
        supabase
          .from("field_values")
          .select(
            "talent_profile_id, field_definition_id, value_text, value_number, value_boolean, value_date, value_taxonomy_ids",
          )
          .in("talent_profile_id", profileIds)
          .in("field_definition_id", cardDefinitionIds),
    );

    if (fvErr) {
      throw new Error(`[directory] field_values for cards: ${fvErr.message}`);
    }

    const termIdSet = new Set<string>();
    for (const raw of (fvRows ?? []) as FieldValueRow[]) {
      for (const tid of raw.value_taxonomy_ids ?? []) {
        if (tid) termIdSet.add(tid);
      }
    }

    if (termIdSet.size > 0) {
      const { data: termRows, error: termErr } = await auditTime(
        audit,
        timings,
        "cardTaxonomyTermsMs",
        () =>
          supabase
            .from("taxonomy_terms")
            .select("id, name_en, name_es")
            .in("id", [...termIdSet]),
      );

      if (termErr) {
        throw new Error(`[directory] taxonomy_terms for cards: ${termErr.message}`);
      }
      for (const t of (termRows ?? []) as {
        id: string;
        name_en: string;
        name_es: string | null;
      }[]) {
        termsById.set(t.id, { name_en: t.name_en, name_es: t.name_es });
      }
    }

    for (const raw of (fvRows ?? []) as FieldValueRow[]) {
      let inner = valuesByProfileId.get(raw.talent_profile_id);
      if (!inner) {
        inner = new Map();
        valuesByProfileId.set(raw.talent_profile_id, inner);
      }
      inner.set(raw.field_definition_id, raw);
    }
  }

  const [taxonomyRowsRes, mediaRowsRes] = await auditTime(
    audit,
    timings,
    "listingTaxonomyAndMediaMs",
    () =>
      Promise.all([
        supabase
          .from("talent_profile_taxonomy")
          .select(
            `
        talent_profile_id,
        is_primary,
        taxonomy_terms ( id, kind, slug, name_en, name_es, sort_order )
      `,
          )
          .in("talent_profile_id", profileIds),
        supabase
          .from("media_assets")
          .select(
            "owner_talent_profile_id, width, height, bucket_id, storage_path, variant_kind, sort_order, created_at",
          )
          .in("owner_talent_profile_id", profileIds)
          .eq("approval_state", "approved")
          .is("deleted_at", null)
          .in("variant_kind", ["card", "public_watermarked", "gallery"])
          .order("sort_order", { ascending: true })
          .order("created_at", { ascending: true }),
      ]),
  );

  if (taxonomyRowsRes.error) {
    throw new Error(`[directory] taxonomy rows: ${taxonomyRowsRes.error.message}`);
  }

  if (mediaRowsRes.error) {
    throw new Error(`[directory] media rows: ${mediaRowsRes.error.message}`);
  }

  const taxonomyByProfile = new Map<string, TaxonomyAssignmentRow[]>();
  for (const row of (taxonomyRowsRes.data ?? []) as TaxonomyAssignmentRow[]) {
    const items = taxonomyByProfile.get(row.talent_profile_id) ?? [];
    items.push(row);
    taxonomyByProfile.set(row.talent_profile_id, items);
  }

  const mediaByProfile = new Map<string, MediaRow[]>();
  for (const row of (mediaRowsRes.data ?? []) as MediaRow[]) {
    const items = mediaByProfile.get(row.owner_talent_profile_id) ?? [];
    items.push(row);
    mediaByProfile.set(row.owner_talent_profile_id, items);
  }

  const mapStart = performance.now();
  const rows: ApiDirectoryCardRpcRow[] = profiles.map((profile) => {
    const taxonomyRows = taxonomyByProfile.get(profile.id) ?? [];
    const mediaRows = mediaByProfile.get(profile.id) ?? [];
    const location = cardResidenceLocation(profile);

    let primaryTalentType:
      | {
          name_en: string;
          name_es: string | null;
        }
      | null = null;
    const fitLabels: Array<{
      slug: string;
      name_en: string;
      name_es: string | null;
      sort_order: number;
    }> = [];

    for (const taxonomyRow of taxonomyRows) {
      const terms = taxonomyRow.taxonomy_terms
        ? Array.isArray(taxonomyRow.taxonomy_terms)
          ? taxonomyRow.taxonomy_terms
          : [taxonomyRow.taxonomy_terms]
        : [];

      for (const term of terms) {
        if (
          term.kind === "talent_type" &&
          (!primaryTalentType || taxonomyRow.is_primary)
        ) {
          primaryTalentType = {
            name_en: term.name_en,
            name_es: term.name_es,
          };
        }

        if (fitLabelsEnabled && term.kind === "fit_label") {
          fitLabels.push({
            slug: term.slug,
            name_en: term.name_en,
            name_es: term.name_es,
            sort_order: term.sort_order,
          });
        }
      }
    }

    fitLabels.sort((a, b) => a.sort_order - b.sort_order || a.name_en.localeCompare(b.name_en));

    const profileTaxonomyTerms: ProfileTaxonomyTerm[] = [];
    for (const taxonomyRow of taxonomyRows) {
      const terms = taxonomyRow.taxonomy_terms
        ? Array.isArray(taxonomyRow.taxonomy_terms)
          ? taxonomyRow.taxonomy_terms
          : [taxonomyRow.taxonomy_terms]
        : [];
      for (const term of terms) {
        profileTaxonomyTerms.push({
          kind: term.kind,
          name_en: term.name_en,
          name_es: term.name_es,
          sort_order: term.sort_order,
        });
      }
    }

    const profileTermIds = new Set<string>();
    for (const taxonomyRow of taxonomyRows) {
      const terms = taxonomyRow.taxonomy_terms
        ? Array.isArray(taxonomyRow.taxonomy_terms)
          ? taxonomyRow.taxonomy_terms
          : [taxonomyRow.taxonomy_terms]
        : [];
      for (const term of terms) {
        if (typeof term.id === "string" && term.id) profileTermIds.add(term.id);
      }
    }

    const matchLabels =
      locationSlug.length > 0 || taxonomyTermIds.length > 0
        ? buildClassicFilterMatchLabels(
            locale,
            locationSlug,
            taxonomyTermIds,
            termMetaById,
            profileTermIds,
            location,
          )
        : [];

    const chosenMedia =
      mediaRows.find((row) => row.variant_kind === "card") ??
      mediaRows.find((row) => row.variant_kind === "public_watermarked") ??
      mediaRows.find((row) => row.variant_kind === "gallery") ??
      null;

    const valuesMap = valuesByProfileId.get(profile.id) ?? new Map<string, FieldValueRow>();
    const cardAttributes = buildCardAttributesForProfile(
      { id: profile.id, height_cm: profile.height_cm },
      locale,
      heightCardDef,
      scalarCardDefs,
      valuesMap,
      termsById,
      profileTaxonomyTerms,
    );

    return {
      id: profile.id,
      profile_code: profile.profile_code,
      public_slug_part: profile.public_slug_part,
      display_name: profile.display_name,
      first_name: profile.first_name,
      last_name: profile.last_name,
      created_at: profile.created_at,
      is_featured: profile.is_featured,
      featured_level: profile.featured_level,
      featured_position: profile.featured_position,
      profile_completeness_score: profile.profile_completeness_score,
      manual_rank_override: profile.manual_rank_override,
      thumb_width: chosenMedia?.width ?? null,
      thumb_height: chosenMedia?.height ?? null,
      thumb_bucket_id: chosenMedia?.bucket_id ?? null,
      thumb_storage_path: chosenMedia?.storage_path ?? null,
      primary_talent_type_name_en: primaryTalentType?.name_en ?? null,
      primary_talent_type_name_es: primaryTalentType?.name_es ?? null,
      location_display_en: location?.display_name_en ?? null,
      location_display_es: location?.display_name_es ?? null,
      location_country_code: location?.country_code ?? null,
      fit_labels_jsonb: fitLabels.slice(0, 2).map((label) => ({
        slug: label.slug,
        name_en: label.name_en,
        name_es: label.name_es,
      })),
      // Omit canonical height from the DTO when `height_cm` is not card-visible (admin grid toggle).
      height_cm: heightCardDef ? profile.height_cm : null,
      card_attributes_jsonb: cardAttributes,
      filter_match_labels_jsonb:
        matchLabels.length > 0 ? matchLabels : undefined,
    };
  });

  const items = rows.map((row) =>
    mapApiDirectoryRpcRowToDirectoryCardDTO(supabase, row, locale),
  );
  if (audit) {
    timings.mapProfilesToDtoMs = performance.now() - mapStart;
  }

  const nextCursor =
    profiles.length === limit
      ? encodeDirectoryCursor({ offset: offset + limit })
      : null;

  if (audit) {
    timings.wallTotalMs = performance.now() - wallStart;
    console.log(
      JSON.stringify({
        event: "directory_fetch_directory_page",
        timings,
        limit,
        sort,
        offset,
        hasQuery: queryText.length > 0,
        hasLocationSlug: locationSlug.length > 0,
        taxonomyTermIdsCount: taxonomyTermIds.length,
        itemCount: items.length,
      }),
    );
  }

  return {
    items,
    nextCursor,
    ...(totalCount !== undefined ? { totalCount } : {}),
    taxonomyTermIds,
  };
}
