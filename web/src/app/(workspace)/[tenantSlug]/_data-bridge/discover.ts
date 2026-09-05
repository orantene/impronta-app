import "server-only";

import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError } from "@/lib/server/safe-error";
import { resolveTalentCardThumbsForHub } from "@/lib/media/talent-media-for-hub";
import { byLabel } from "@/lib/field-engine/sort-comparators";
import {
  buildLocationCatalog,
  buildLocationFacets,
  resolveLocationFilterIds,
  type CanonicalLocation,
} from "@/lib/directory/location-facets";

/**
 * _data-bridge/discover.ts — cross-tenant Discover catalog reads.
 *
 * Server-side mirror of /api/discover/talents for SSR initial loads.
 * Returns is_discoverable=true talents across all tenants. RLS bypassed
 * via service-role — Discover is platform-wide by design (see
 * web/docs/discover-and-unified-inquiry-2026-05-14.md §7). Same shape
 * as the REST API so the client component can paginate via fetch
 * without remapping types.
 */

// Card/face photo resolution is centralized in `loadTalentCardThumbs`
// (./talent-card-thumbs) so Discover renders the same face as the agency
// roster and the talent's own dashboard. Priority there is
// card → hero → public_watermarked → gallery → original.

// ---------------------------------------------------------------------------
// Location facets read the residence FOREIGN KEY, not the free text.
//
// `home_country_text` / `home_city_text` are denormalized free text, and the
// old grouping key was `country.toLowerCase()` — which folds case but NOT
// diacritics. Production carried "Mexico" (41), "mexico" (2) and "México" (4);
// the first two folded together and the third became a rival bucket, so
// ?country=Mexico returned 43 and ?country=México returned 4, disjoint.
// The city label was composed from the two free-text fields independently, so
// "Buenos Aires, Mexico" could render.
//
// Both facets now derive from `residence_city_id` -> `locations` -> `countries`
// (see lib/directory/location-facets.ts), which makes one Mexico structural and
// a wrong city/country pair impossible. Params stay human-readable and are
// matched through `normalizeLocationKey`, so old ?country=México links resolve
// to the single bucket instead of breaking.
// ---------------------------------------------------------------------------

/** True if `s` contains any uppercase character (Unicode-aware). */
const hasUpper = (s: string) => s.toLowerCase() !== s;

/**
 * Pick the cleanest display variant among same-but-differently-cased values.
 * Prefers a variant that carries case ("Mexico", "USA") over an all-lowercase
 * one ("mexico"); otherwise keeps the first-seen (stable). The result is a
 * real value from the data, never a synthetically re-cased string.
 */
function preferDisplay(prev: string | undefined, next: string): string {
  if (!prev) return next;
  if (!hasUpper(prev) && hasUpper(next)) return next;
  return prev;
}

/**
 * Load the canonical location catalog (id -> city + its own country).
 *
 * Shared by the facet builders and the WHERE clauses so both read one
 * derivation. When they read different ones they drift, which is precisely how
 * the free-text version displayed a "México" bucket whose own filter could not
 * reproduce it.
 */
async function loadLocationCatalog(
  admin: ReturnType<typeof createServiceRoleClient>,
  locale = "en",
): Promise<Map<string, CanonicalLocation>> {
  if (!admin) return new Map();
  const [locs, countries] = await Promise.all([
    admin.from("locations").select("id, country_code, city_slug, display_name_i18n"),
    admin.from("countries").select("iso2, name_en, name_es"),
  ]);
  if (locs.error) {
    logServerError("workspace.loadLocationCatalog.locations", locs.error);
    return new Map();
  }
  if (countries.error) {
    logServerError("workspace.loadLocationCatalog.countries", countries.error);
    return new Map();
  }
  return buildLocationCatalog(
    (locs.data ?? []) as never[],
    (countries.data ?? []) as never[],
    locale,
  );
}

export type DiscoverTalentListItem = {
  id: string;
  displayName: string;
  profileCode: string | null;
  primaryTypeLabel: string | null;
  primaryTypeSlug: string | null;
  homeCity: string | null;
  homeCountry: string | null;
  /**
   * D9 — geocoded coordinates from the canonical locations table
   * (talent_profiles.residence_city_id → locations). Either both set or
   * both null. Map-view callers should filter out null pairs; the
   * grid/list views ignore these and stay text-only.
   */
  homeLat: number | null;
  homeLng: number | null;
  agencyName: string | null;
  agencyTenantId: string | null;
  isExclusive: boolean;
  headshotUrl: string | null;
  /**
   * D1 — availability snapshot from the talent_discover_index materialized
   * view. All three fields refresh together on the view's 15-min cron +
   * on-event triggers. nextAvailableDate is ISO yyyy-mm-dd or null when
   * the talent is blocked for the full 30-day window.
   * availabilityDots14d is a 14-char string of '·' (free) and '×' (blocked)
   * for the next 14 days starting from refresh-time today.
   */
  nextAvailableDate: string | null;
  availableDaysInNext30: number | null;
  availabilityDots14d: string | null;
  /**
   * A2 — derived trust ladder tier from the talent_discover_index matview.
   * One of: 'basic' | 'verified' | 'silver' | 'gold'. Null only if the
   * matview row is missing the column (shouldn't happen post-migration
   * 20260520000921_directory_trust_tier.sql). Phase B #3 of the directory
   * plan surfaces this as the real Basic/Verified/Silver/Gold badge.
   */
  trustTier: string | null;
  /**
   * STANDING v3 (item 9) — verified review aggregates denormalized on the
   * matview (talent_profiles.rating_avg/rating_count/would_book_again_pct,
   * recomputed by talent_reviews_recompute_summary). Cross-tenant / portable by
   * design. Null / 0 when the talent has no published+verified reviews. Card
   * adapters render a STANDING chip only past the credibility floor, and only on
   * a reviews-entitled surface (the marketing global directory is platform-host,
   * so entitled; per-tenant surfaces must gate on tenantReviewsEnabled).
   */
  ratingAvg: number | null;
  ratingCount: number | null;
  wouldBookAgainPct: number | null;
};

export type DiscoverFacets = {
  countries: Array<{ value: string; count: number }>;
  categories: Array<{ value: string; label: string; count: number }>;
};

export type DiscoverHub = {
  id: string;
  displayName: string;
  planTier: "studio" | "agency" | "network";
  discoverableTalentCount: number;
};

export type DiscoverShortlistTalent = {
  talentId: string;
  displayName: string;
  /** Public profile code (`/t/[code]`) — carried for `<TalentCardActions>`. */
  profileCode: string | null;
  primaryTypeLabel: string | null;
  homeCity: string | null;
  homeCountry: string | null;
  /** Primary (exclusive) agency display name when one exists. Null otherwise. */
  agencyName: string | null;
  /** Primary agency tenant_id when one exists. Null otherwise. */
  agencyTenantId: string | null;
  /** True when the primary roster has is_primary=true (= exclusive). */
  isExclusive: boolean;
  /** Where /api/discover/inquiry would route this talent (primary if present, else
   *  first active roster tenant — distinct from agencyTenantId because the
   *  fallback may be a Free-plan workspace that doesn't get the exclusive badge). */
  routesToTenantId: string | null;
  routesToTenantName: string | null;
  headshotUrl: string | null;
};

export type DiscoverShortlistWithTalents = {
  id: string;
  name: string;
  eventDateHint: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  talents: DiscoverShortlistTalent[];
};

/**
 * Result ordering for the public directory. Both are deterministic against
 * existing matview columns so offset pagination stays stable:
 *   - "recommended" (default): stable display-name order. The matview's
 *     natural set, neutral across talent — doesn't foreground sparse
 *     availability data.
 *   - "availability": most free days in the next 30 first, name as tiebreak.
 * "Newest" is intentionally NOT offered — the matview has no per-talent
 * recency column (index_refreshed_at is the same for every row), and we
 * don't widen shared DB infra speculatively.
 */
export type DiscoverSort = "recommended" | "availability";

export type LoadDiscoverTalentsOpts = {
  country?: string;
  category?: string;
  q?: string;
  /** Filter to talents whose primary roster is on this tenant (= agency hub). */
  hub?: string;
  /** Filter to a specific home city (matview home_city_text). */
  city?: string;
  /** Only talents with at least one free day in the next 30. */
  availableOnly?: boolean;
  /** Filter to a trust ladder tier (basic | verified | silver | gold). */
  trustTier?: string;
  /** Result ordering. Defaults to "recommended". */
  sort?: DiscoverSort;
  limit?: number;
  offset?: number;
};

/**
 * Cross-tenant talent listing for the buyer-side Discover surface.
 * Mirrors the shape of GET /api/discover/talents so the client
 * component's incremental fetches return the same item type as the
 * SSR initial load.
 */
export async function loadDiscoverTalents(
  opts: LoadDiscoverTalentsOpts = {},
): Promise<{ items: DiscoverTalentListItem[]; total: number }> {
  const admin = createServiceRoleClient();
  if (!admin) return { items: [], total: 0 };

  const limit = Math.min(Math.max(opts.limit ?? 24, 1), 60);
  const offset = Math.max(opts.offset ?? 0, 0);

  // D1 — query the talent_discover_index materialized view directly.
  // The view denormalizes is_discoverable + workflow_status filtering,
  // primary-agency join (with exclusivity), primary-category join, and
  // the 30-day availability snapshot. The previous read-time JOIN-heavy
  // query against talent_profiles is gone — its category-in-JS filter
  // is replaced with an index lookup on `category_slug`. See
  // supabase/migrations/20260515134903_talent_discover_index.sql.
  let query = admin
    .from("talent_discover_index")
    .select(
      `id, display_name, first_name, last_name, profile_code,
       home_country_text, home_city_text, residence_city_id,
       agency_tenant_id, agency_name, is_exclusive,
       category_label, category_slug,
       next_available_date, available_days_in_next_30, availability_dots_14d,
       trust_tier, rating_avg, rating_count, would_book_again_pct`,
      { count: "exact" },
    );

  if (opts.category)  query = query.eq("category_slug", opts.category);
  if (opts.hub)       query = query.eq("agency_tenant_id", opts.hub);
  // Location filters resolve through the residence FK, never the free text.
  // `resolveLocationFilterIds` returns [] when the params match nothing, and
  // that MUST scope to no results rather than silently dropping the filter —
  // a filter that no-ops when unresolvable is how a scoped page starts showing
  // everything.
  if (opts.country || opts.city) {
    const catalog = await loadLocationCatalog(admin);
    const ids = resolveLocationFilterIds(catalog, {
      country: opts.country,
      city: opts.city,
    });
    query = ids.length
      ? query.in("residence_city_id", ids)
      : query.is("id", null);
  }
  if (opts.trustTier) query = query.eq("trust_tier", opts.trustTier);
  if (opts.availableOnly) query = query.gt("available_days_in_next_30", 0);
  if (opts.q)         query = query.ilike("display_name", `%${opts.q}%`);

  if (opts.sort === "availability") {
    query = query
      .order("available_days_in_next_30", { ascending: false, nullsFirst: false })
      .order("display_name", { ascending: true, nullsFirst: false });
  } else {
    query = query.order("display_name", { ascending: true, nullsFirst: false });
  }

  query = query.range(offset, offset + limit - 1);

  const { data, error, count } = await query;
  if (error) {
    logServerError("workspace.loadDiscoverTalents", error);
    return { items: [], total: 0 };
  }

  type IndexRow = {
    id: string;
    display_name: string | null;
    first_name: string | null;
    last_name: string | null;
    profile_code: string | null;
    home_country_text: string | null;
    home_city_text: string | null;
    residence_city_id: string | null;
    agency_tenant_id: string | null;
    agency_name: string | null;
    is_exclusive: boolean;
    category_label: string | null;
    category_slug: string | null;
    next_available_date: string | null;
    available_days_in_next_30: number | null;
    availability_dots_14d: string | null;
    trust_tier: string | null;
    rating_avg: number | null;
    rating_count: number | null;
    would_book_again_pct: number | null;
  };

  const rows = (data ?? []) as unknown as IndexRow[];
  const ids = rows.map((r) => r.id);

  // Supplementary lookups: photos + geo coords. Both are kept off the
  // materialized view because:
  //   - photos: storage_path requires the storage client to resolve to a
  //     public URL; that's a runtime concern, not a denorm-able field.
  //   - geo coords: live on locations.{latitude,longitude} via the
  //     residence_city_id FK; can be added to the view later if map-view
  //     callers become hot. For now we batch-fetch them in one go.
  const photoByTalent = await resolveTalentCardThumbsForHub(admin, ids, null);
  const coordsByCityId = new Map<string, { lat: number | null; lng: number | null }>();

  if (ids.length > 0) {
    // Geo coords (batch-by-city-id to dedupe shared cities).
    const cityIds = Array.from(
      new Set(rows.map((r) => r.residence_city_id).filter((x): x is string => !!x)),
    );
    if (cityIds.length > 0) {
      const { data: locs } = await admin
        .from("locations")
        .select("id, latitude, longitude")
        .in("id", cityIds);
      for (const l of (locs ?? []) as Array<{ id: string; latitude: number | null; longitude: number | null }>) {
        coordsByCityId.set(l.id, {
          lat: typeof l.latitude === "number" ? l.latitude : null,
          lng: typeof l.longitude === "number" ? l.longitude : null,
        });
      }
    }
  }

  const items: DiscoverTalentListItem[] = rows.map((row) => {
    const displayName =
      (row.display_name ?? "").trim()
      || `${row.first_name ?? ""} ${row.last_name ?? ""}`.trim()
      || "Unnamed";
    const coords = row.residence_city_id ? coordsByCityId.get(row.residence_city_id) : null;
    return {
      id: row.id,
      displayName,
      profileCode: row.profile_code,
      primaryTypeLabel: row.category_label,
      primaryTypeSlug: row.category_slug,
      homeCity: row.home_city_text,
      homeCountry: row.home_country_text,
      homeLat: coords?.lat ?? null,
      homeLng: coords?.lng ?? null,
      agencyName: row.agency_name,
      agencyTenantId: row.agency_tenant_id,
      isExclusive: row.is_exclusive,
      headshotUrl: photoByTalent.get(row.id) ?? null,
      nextAvailableDate: row.next_available_date,
      availableDaysInNext30: row.available_days_in_next_30,
      availabilityDots14d: row.availability_dots_14d,
      trustTier: row.trust_tier,
      ratingAvg: typeof row.rating_avg === "number" ? row.rating_avg : null,
      ratingCount: typeof row.rating_count === "number" ? row.rating_count : null,
      wouldBookAgainPct:
        typeof row.would_book_again_pct === "number" ? row.would_book_again_pct : null,
    };
  });

  return { items, total: count ?? items.length };
}

/**
 * Directory facets for the public marketing directory. Single pass over the
 * `talent_discover_index` matview (already filtered to discoverable +
 * approved/published), tallied in JS. Distinct from `loadDiscoverFacets`
 * (which reads talent_profiles for the buyer Discover surface): this one
 * adds city + trust-tier facets the marketing sidebar needs, sourced from
 * the same denormalized row the cards render from.
 */
export type DirectoryFacets = {
  countries: Array<{ value: string; count: number }>;
  categories: Array<{ value: string; label: string; count: number }>;
  /** One row per (city, country) pair — a city in two countries stays two
   *  rows so the filter scopes by both. The view composes the dedupe key. */
  cities: Array<{ city: string; country: string | null; count: number }>;
  trustTiers: Array<{ value: string; count: number }>;
};

export async function loadDirectoryFacets(): Promise<DirectoryFacets> {
  const admin = createServiceRoleClient();
  const empty: DirectoryFacets = { countries: [], categories: [], cities: [], trustTiers: [] };
  if (!admin) return empty;

  const { data, error } = await admin
    .from("talent_discover_index")
    .select("residence_city_id, category_slug, category_label, trust_tier");

  if (error) {
    logServerError("workspace.loadDirectoryFacets", error);
    return empty;
  }

  type Row = {
    residence_city_id: string | null;
    category_slug: string | null;
    category_label: string | null;
    trust_tier: string | null;
  };
  const rows = (data ?? []) as unknown as Row[];

  // Category slug and trust tier are controlled enums, so a plain string key is
  // correct for them. Country and city are NOT: they now derive from the
  // residence FK via the shared catalog, so one Mexico is structural and a
  // city can never be paired with a country it is not in.
  const categoryCounts = new Map<string, { label: string; count: number }>();
  const trustCounts = new Map<string, number>();

  for (const row of rows) {
    const slug = row.category_slug?.trim();
    const label = row.category_label?.trim();
    if (slug && label) {
      const existing = categoryCounts.get(slug);
      categoryCounts.set(slug, { label: existing?.label ?? label, count: (existing?.count ?? 0) + 1 });
    }

    const tier = row.trust_tier?.trim();
    if (tier) trustCounts.set(tier, (trustCounts.get(tier) ?? 0) + 1);
  }

  const { countries, cities } = buildLocationFacets(rows, await loadLocationCatalog(admin));

  return {
    countries,
    categories: Array.from(categoryCounts.entries())
      .map(([value, { label, count }]) => ({ value, label, count }))
      .sort((a, b) => b.count - a.count || byLabel(a, b)),
    cities,
    trustTiers: Array.from(trustCounts.entries())
      .map(([value, count]) => ({ value, count }))
      .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value)),
  };
}

/**
 * Lean map points for the directory map view. Unlike `loadDiscoverTalents`
 * (page-capped at 60), this returns the FULL filtered discoverable set that
 * has geocoded coordinates, so every matching talent appears as a pin.
 * Same matview + same filters as the grid — only the shape differs.
 */
export type DiscoverMapPoint = {
  id: string;
  displayName: string;
  profileCode: string | null;
  primaryTypeLabel: string | null;
  homeCity: string | null;
  homeCountry: string | null;
  agencyName: string | null;
  isExclusive: boolean;
  headshotUrl: string | null;
  trustTier: string | null;
  availableDaysInNext30: number | null;
  homeLat: number;
  homeLng: number;
  // Map pins carry no verified-standing signal (a pin is a location, not a
  // browse card), but a selected pin renders through the same DirectoryCardRow
  // card, so these are present-and-null to satisfy the shared shape.
  ratingAvg: number | null;
  ratingCount: number | null;
};

export async function loadDiscoverMapPoints(
  opts: Pick<LoadDiscoverTalentsOpts, "country" | "category" | "q" | "city" | "trustTier" | "availableOnly"> = {},
): Promise<{ points: DiscoverMapPoint[]; unmappedCount: number }> {
  const admin = createServiceRoleClient();
  if (!admin) return { points: [], unmappedCount: 0 };

  let query = admin
    .from("talent_discover_index")
    .select(
      `id, display_name, first_name, last_name, profile_code,
       home_country_text, home_city_text, residence_city_id,
       agency_name, is_exclusive, category_label,
       trust_tier, available_days_in_next_30`,
    )
    .order("display_name", { ascending: true, nullsFirst: false })
    .limit(500);

  if (opts.category)  query = query.eq("category_slug", opts.category);
  // Location filters resolve through the residence FK, never the free text.
  // `resolveLocationFilterIds` returns [] when the params match nothing, and
  // that MUST scope to no results rather than silently dropping the filter —
  // a filter that no-ops when unresolvable is how a scoped page starts showing
  // everything.
  if (opts.country || opts.city) {
    const catalog = await loadLocationCatalog(admin);
    const ids = resolveLocationFilterIds(catalog, {
      country: opts.country,
      city: opts.city,
    });
    query = ids.length
      ? query.in("residence_city_id", ids)
      : query.is("id", null);
  }
  if (opts.trustTier) query = query.eq("trust_tier", opts.trustTier);
  if (opts.availableOnly) query = query.gt("available_days_in_next_30", 0);
  if (opts.q)         query = query.ilike("display_name", `%${opts.q}%`);

  const { data, error } = await query;
  if (error) {
    logServerError("workspace.loadDiscoverMapPoints", error);
    return { points: [], unmappedCount: 0 };
  }

  type Row = {
    id: string;
    display_name: string | null;
    first_name: string | null;
    last_name: string | null;
    profile_code: string | null;
    home_country_text: string | null;
    home_city_text: string | null;
    residence_city_id: string | null;
    agency_name: string | null;
    is_exclusive: boolean;
    category_label: string | null;
    trust_tier: string | null;
    available_days_in_next_30: number | null;
  };
  const rows = (data ?? []) as unknown as Row[];
  const ids = rows.map((r) => r.id);

  const photoByTalent = await resolveTalentCardThumbsForHub(admin, ids, null);
  const coordsByCityId = new Map<string, { lat: number | null; lng: number | null }>();

  if (ids.length > 0) {
    const cityIds = Array.from(
      new Set(rows.map((r) => r.residence_city_id).filter((x): x is string => !!x)),
    );
    if (cityIds.length > 0) {
      const { data: locs } = await admin
        .from("locations")
        .select("id, latitude, longitude")
        .in("id", cityIds);
      for (const l of (locs ?? []) as Array<{ id: string; latitude: number | null; longitude: number | null }>) {
        coordsByCityId.set(l.id, {
          lat: typeof l.latitude === "number" ? l.latitude : null,
          lng: typeof l.longitude === "number" ? l.longitude : null,
        });
      }
    }
  }

  const points: DiscoverMapPoint[] = [];
  let unmappedCount = 0;
  for (const row of rows) {
    const coords = row.residence_city_id ? coordsByCityId.get(row.residence_city_id) : null;
    if (coords?.lat == null || coords?.lng == null) {
      unmappedCount++;
      continue;
    }
    const displayName =
      (row.display_name ?? "").trim()
      || `${row.first_name ?? ""} ${row.last_name ?? ""}`.trim()
      || "Unnamed";
    points.push({
      id: row.id,
      displayName,
      profileCode: row.profile_code,
      primaryTypeLabel: row.category_label,
      homeCity: row.home_city_text,
      homeCountry: row.home_country_text,
      agencyName: row.agency_name,
      isExclusive: row.is_exclusive,
      headshotUrl: photoByTalent.get(row.id) ?? null,
      trustTier: row.trust_tier,
      availableDaysInNext30: row.available_days_in_next_30,
      homeLat: coords.lat,
      homeLng: coords.lng,
      ratingAvg: null,
      ratingCount: null,
    });
  }

  return { points, unmappedCount };
}

/**
 * Facet counts mirror — same logic as /api/discover/facets. Server-side
 * load so the filter chip bar renders with counts on first paint.
 */
export async function loadDiscoverFacets(): Promise<DiscoverFacets> {
  const admin = createServiceRoleClient();
  if (!admin) return { countries: [], categories: [] };

  const { data, error } = await admin
    .from("talent_profiles")
    .select(
      `
      home_country_text,
      talent_profile_taxonomy (
        relationship_type,
        taxonomy_terms ( name_i18n, slug )
      )
      `,
    )
    .eq("is_discoverable", true)
    .neq("profile_kind", "resource")
    .in("workflow_status", ["approved", "published"]);

  if (error) {
    logServerError("workspace.loadDiscoverFacets", error);
    return { countries: [], categories: [] };
  }

  type Row = {
    home_country_text: string | null;
    talent_profile_taxonomy: Array<{
      relationship_type: string | null;
      taxonomy_terms: { name_i18n: Record<string, string | null> | null; slug: string | null } | null;
    }> | null;
  };

  const rows = (data ?? []) as unknown as Row[];
  // Country folds case (see helpers at top of file) so "Mexico"/"mexico" don't
  // split into two rows with halved counts — the buyer Discover filter matches
  // case-insensitively (ilike), so the folded display value still catches every
  // stored variant.
  const countryAgg = new Map<string, { display: string; count: number }>();
  const categoryCounts = new Map<string, { label: string; count: number }>();

  for (const row of rows) {
    const country = row.home_country_text?.trim();
    if (country) {
      const key = country.toLowerCase();
      const cur = countryAgg.get(key);
      countryAgg.set(key, { display: preferDisplay(cur?.display, country), count: (cur?.count ?? 0) + 1 });
    }
    const tax = row.talent_profile_taxonomy ?? [];
    const primary = tax.find((t) => t.relationship_type === "primary_role");
    const slug = primary?.taxonomy_terms?.slug?.trim();
    const label = primary?.taxonomy_terms?.name_i18n?.en?.trim();
    if (slug && label) {
      const existing = categoryCounts.get(slug);
      categoryCounts.set(slug, {
        label: existing?.label ?? label,
        count: (existing?.count ?? 0) + 1,
      });
    }
  }

  return {
    countries: Array.from(countryAgg.values())
      .map(({ display, count }) => ({ value: display, count }))
      .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value)),
    categories: Array.from(categoryCounts.entries())
      .map(([value, { label, count }]) => ({ value, label, count }))
      .sort((a, b) => b.count - a.count || byLabel(a, b)),
  };
}

const HUB_PLAN_TIERS = ["studio", "agency", "network"] as const;

/**
 * Load the signed-in client's shortlists with each talent's card-level
 * data embedded. Used by the /client/shortlists viewer page. Mirrors the
 * shape of `GET /api/discover/shortlists` extended with talent info so
 * the page renders without a per-talent roundtrip.
 */
export async function loadClientShortlistsForUser(
  userId: string,
): Promise<DiscoverShortlistWithTalents[]> {
  const admin = createServiceRoleClient();
  if (!admin) return [];

  const { data, error } = await admin
    .from("client_shortlists")
    .select(
      `
      id, name, event_date_hint, notes, created_at, updated_at,
      client_shortlist_items!shortlist_id (
        added_at,
        talent_profile_id,
        talent_profiles!talent_profile_id (
          id, display_name, first_name, last_name, profile_code,
          home_country_text, home_city_text,
          is_discoverable, workflow_status,
          talent_profile_taxonomy (
            relationship_type,
            taxonomy_terms ( name_i18n )
          ),
          agency_talent_roster!talent_profile_id (
            tenant_id, status, is_primary,
            agencies!tenant_id ( display_name )
          )
        )
      )
      `,
    )
    .eq("client_user_id", userId)
    .order("updated_at", { ascending: false });

  if (error) {
    logServerError("workspace.loadClientShortlists", error);
    return [];
  }

  type Row = {
    id: string;
    name: string;
    event_date_hint: string | null;
    notes: string | null;
    created_at: string;
    updated_at: string;
    client_shortlist_items: Array<{
      added_at: string;
      talent_profile_id: string;
      talent_profiles: {
        id: string;
        display_name: string | null;
        first_name: string | null;
        last_name: string | null;
        profile_code: string | null;
        home_country_text: string | null;
        home_city_text: string | null;
        is_discoverable: boolean | null;
        workflow_status: string | null;
        talent_profile_taxonomy: Array<{
          relationship_type: string | null;
          taxonomy_terms: { name_i18n: Record<string, string | null> | null } | null;
        }> | null;
        agency_talent_roster: Array<{
          tenant_id: string;
          status: string;
          is_primary: boolean;
          agencies: { display_name: string | null } | { display_name: string | null }[] | null;
        }> | null;
      } | null;
    }> | null;
  };

  const rows = (data ?? []) as unknown as Row[];

  // Batch-fetch photos for all talents present across all shortlists.
  const allTalentIds = new Set<string>();
  for (const r of rows) {
    for (const item of r.client_shortlist_items ?? []) {
      if (item.talent_profiles) allTalentIds.add(item.talent_profile_id);
    }
  }

  const photoByTalent = await resolveTalentCardThumbsForHub(admin, Array.from(allTalentIds), null);

  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    eventDateHint: r.event_date_hint,
    notes: r.notes,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    talents: (r.client_shortlist_items ?? [])
      .map((item): DiscoverShortlistTalent | null => {
        const p = item.talent_profiles;
        if (!p) return null;
        const displayName =
          (p.display_name ?? "").trim()
          || `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim()
          || "Unnamed";
        const tax = p.talent_profile_taxonomy ?? [];
        const primaryLabel = tax.find((t) => t.relationship_type === "primary_role")
          ?.taxonomy_terms?.name_i18n?.en ?? null;
        const roster = p.agency_talent_roster ?? [];
        const activeRoster = roster
          .filter((rr) => rr.status === "active" || rr.status === "pending");
        const primary = activeRoster.find((rr) => rr.is_primary) ?? null;
        const fallback = primary ?? activeRoster[0] ?? null;

        const pickAgencyName = (rr: typeof primary): string | null => {
          if (!rr) return null;
          const arr = rr.agencies;
          const row = Array.isArray(arr) ? arr[0] : arr;
          return row?.display_name ?? null;
        };

        return {
          talentId: p.id,
          displayName,
          profileCode: p.profile_code,
          primaryTypeLabel: primaryLabel,
          homeCity: p.home_city_text,
          homeCountry: p.home_country_text,
          agencyName: pickAgencyName(primary),
          agencyTenantId: primary?.tenant_id ?? null,
          isExclusive: !!primary?.is_primary,
          routesToTenantId: fallback?.tenant_id ?? null,
          routesToTenantName: pickAgencyName(fallback),
          headshotUrl: photoByTalent.get(p.id) ?? null,
        };
      })
      .filter((t): t is DiscoverShortlistTalent => t !== null),
  }));
}

export type AdminDiscoverInquiry = {
  inquiryId: string;
  status: string;
  createdAt: string;
  eventDate: string | null;
  eventLocation: string | null;
  contactName: string | null;
  contactEmail: string | null;
  message: string | null;
  /** "discover_single_talent" | "discover_shortlist" */
  sourceChannel: string;
  /** Client trust ladder — drives risk signal on agency intake.
   *  Per project_client_trust_badges.md: basic / verified / silver / gold.
   *  Computed from client_profiles.trust_tier on the client_user_id
   *  who submitted the inquiry. Null when the inquiry was a guest. */
  clientTrustTier: "basic" | "verified" | "silver" | "gold" | null;
  /** Total talents on this inquiry from this tenant. */
  talents: Array<{
    talentId: string;
    displayName: string;
    headshotUrl: string | null;
  }>;
  /** True when source_channel = "discover_shortlist" — context for the
   *  "This is 1-of-N in a fanned inquiry" hint. We can't easily count
   *  sibling inquiries from other tenants without joining on
   *  source_context.shortlist_id; flag the type here for now. */
  isPartOfFanout: boolean;
  /** When part of a shortlist fan-out, the shortlist UUID set on submit. */
  sourceShortlistId: string | null;
};

/**
 * Load the workspace's Discover-originated inquiries (single + shortlist
 * sources) for the admin's dedicated Discover-inquiries view.
 */
export async function loadAdminDiscoverInquiries(
  tenantId: string,
): Promise<AdminDiscoverInquiry[]> {
  const admin = createServiceRoleClient();
  if (!admin) return [];

  const { data, error } = await admin
    .from("inquiries")
    .select(
      `
      id, status, created_at, event_date, event_location,
      contact_name, contact_email, message,
      source_channel, source_context,
      client_user_id,
      inquiry_participants!inquiry_id (
        role,
        talent_profile_id,
        talent_profiles!talent_profile_id ( id, display_name, first_name, last_name )
      )
      `,
    )
    .eq("tenant_id", tenantId)
    .in("source_channel", ["discover_single_talent", "discover_shortlist"])
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) {
    logServerError("workspace.loadAdminDiscoverInquiries", error);
    return [];
  }

  type Row = {
    id: string;
    status: string;
    created_at: string;
    event_date: string | null;
    event_location: string | null;
    contact_name: string | null;
    contact_email: string | null;
    message: string | null;
    source_channel: string;
    source_context: { shortlist_id?: string | null } | null;
    client_user_id: string | null;
    inquiry_participants: Array<{
      role: string;
      talent_profile_id: string | null;
      talent_profiles: {
        id: string;
        display_name: string | null;
        first_name: string | null;
        last_name: string | null;
      } | null;
    }> | null;
  };

  const rows = (data ?? []) as unknown as Row[];

  // Batch-fetch client trust tiers + photos for all participants.
  const clientUserIds = new Set<string>();
  for (const r of rows) {
    if (r.client_user_id) clientUserIds.add(r.client_user_id);
  }
  const trustByClient = new Map<string, "basic" | "verified" | "silver" | "gold">();
  if (clientUserIds.size > 0) {
    const { data: clientRows } = await admin
      .from("client_profiles")
      .select("user_id, trust_tier")
      .in("user_id", Array.from(clientUserIds));
    for (const cr of (clientRows ?? []) as Array<{ user_id: string; trust_tier: string | null }>) {
      const tier = cr.trust_tier;
      if (tier === "basic" || tier === "verified" || tier === "silver" || tier === "gold") {
        trustByClient.set(cr.user_id, tier);
      }
    }
  }

  const talentIds = new Set<string>();
  for (const r of rows) {
    for (const p of r.inquiry_participants ?? []) {
      if (p.role === "talent" && p.talent_profile_id) talentIds.add(p.talent_profile_id);
    }
  }

  const photoByTalent = await resolveTalentCardThumbsForHub(admin, Array.from(talentIds), tenantId);

  return rows.map((r) => {
    const talents = (r.inquiry_participants ?? [])
      .filter((p) => p.role === "talent" && p.talent_profiles)
      .map((p) => {
        const tp = p.talent_profiles!;
        const displayName =
          (tp.display_name ?? "").trim()
          || `${tp.first_name ?? ""} ${tp.last_name ?? ""}`.trim()
          || "Unnamed";
        return {
          talentId: tp.id,
          displayName,
          headshotUrl: photoByTalent.get(tp.id) ?? null,
        };
      });
    return {
      inquiryId: r.id,
      status: r.status,
      createdAt: r.created_at,
      eventDate: r.event_date,
      eventLocation: r.event_location,
      contactName: r.contact_name,
      contactEmail: r.contact_email,
      message: r.message,
      sourceChannel: r.source_channel,
      clientTrustTier: r.client_user_id ? (trustByClient.get(r.client_user_id) ?? "basic") : null,
      talents,
      isPartOfFanout: r.source_channel === "discover_shortlist",
      sourceShortlistId: r.source_context?.shortlist_id ?? null,
    };
  });
}

/**
 * Load the signed-in client's favorited talents with card-level data
 * embedded. Used by the /client/favorites page. Mirror of GET
 * /api/discover/favorites — talent details denormalized so the page
 * renders without per-row roundtrips.
 *
 * A4 (cross-tenant): client_favorites is keyed by client_user_id only —
 * no tenant scope — so favorites saved on any agency storefront appear
 * here. This is intentional: a client builds one global favorites list
 * that follows them across agencies.
 */
export async function loadClientFavoritesForUser(
  userId: string,
): Promise<DiscoverShortlistTalent[]> {
  const admin = createServiceRoleClient();
  if (!admin) return [];

  const { data, error } = await admin
    .from("client_favorites")
    .select(
      `
      added_at,
      talent_profile_id,
      talent_profiles!talent_profile_id (
        id, display_name, first_name, last_name, profile_code,
        home_country_text, home_city_text,
        is_discoverable, workflow_status,
        talent_profile_taxonomy (
          relationship_type,
          taxonomy_terms ( name_i18n )
        ),
        agency_talent_roster!talent_profile_id (
          tenant_id, status, is_primary,
          agencies!tenant_id ( display_name )
        )
      )
      `,
    )
    .eq("client_user_id", userId)
    .order("added_at", { ascending: false });

  if (error) {
    logServerError("workspace.loadClientFavorites", error);
    return [];
  }

  type Row = {
    added_at: string;
    talent_profile_id: string;
    talent_profiles: {
      id: string;
      display_name: string | null;
      first_name: string | null;
      last_name: string | null;
      profile_code: string | null;
      home_country_text: string | null;
      home_city_text: string | null;
      is_discoverable: boolean | null;
      workflow_status: string | null;
      talent_profile_taxonomy: Array<{
        relationship_type: string | null;
        taxonomy_terms: { name_i18n: Record<string, string | null> | null } | null;
      }> | null;
      agency_talent_roster: Array<{
        tenant_id: string;
        status: string;
        is_primary: boolean;
        agencies: { display_name: string | null } | { display_name: string | null }[] | null;
      }> | null;
    } | null;
  };

  const rows = (data ?? []) as unknown as Row[];

  // Batch-fetch photos.
  const ids = rows.map((r) => r.talent_profile_id);
  const photoByTalent = await resolveTalentCardThumbsForHub(admin, ids, null);

  return rows
    .map((row): DiscoverShortlistTalent | null => {
      const p = row.talent_profiles;
      if (!p) return null;
      const displayName =
        (p.display_name ?? "").trim()
        || `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim()
        || "Unnamed";
      const tax = p.talent_profile_taxonomy ?? [];
      const primaryLabel = tax.find((t) => t.relationship_type === "primary_role")
        ?.taxonomy_terms?.name_i18n?.en ?? null;
      const roster = (p.agency_talent_roster ?? []).filter(
        (r) => r.status === "active" || r.status === "pending",
      );
      const primary = roster.find((r) => r.is_primary) ?? null;
      const fallback = primary ?? roster[0] ?? null;
      const pickAgencyName = (rr: typeof primary): string | null => {
        if (!rr) return null;
        const arr = rr.agencies;
        const r = Array.isArray(arr) ? arr[0] : arr;
        return r?.display_name ?? null;
      };
      return {
        talentId: p.id,
        displayName,
        profileCode: p.profile_code,
        primaryTypeLabel: primaryLabel,
        homeCity: p.home_city_text,
        homeCountry: p.home_country_text,
        agencyName: pickAgencyName(primary),
        agencyTenantId: primary?.tenant_id ?? null,
        isExclusive: !!primary?.is_primary,
        routesToTenantId: fallback?.tenant_id ?? null,
        routesToTenantName: pickAgencyName(fallback),
        headshotUrl: photoByTalent.get(p.id) ?? null,
      };
    })
    .filter((t): t is DiscoverShortlistTalent => t !== null);
}

/**
 * Hubs list mirror — same logic as /api/discover/hubs. Studio/Agency/Network
 * workspaces with at least one discoverable + approved talent on their roster.
 */
export async function loadDiscoverHubs(): Promise<DiscoverHub[]> {
  const admin = createServiceRoleClient();
  if (!admin) return [];

  const { data, error } = await admin
    .from("agencies")
    .select(
      `
      id, display_name, plan_tier,
      agency_talent_roster!tenant_id (
        status,
        talent_profiles!talent_profile_id ( is_discoverable, workflow_status )
      )
      `,
    )
    .in("plan_tier", HUB_PLAN_TIERS as unknown as string[])
    .order("display_name", { ascending: true });

  if (error) {
    logServerError("workspace.loadDiscoverHubs", error);
    return [];
  }

  type Row = {
    id: string;
    display_name: string | null;
    plan_tier: string | null;
    agency_talent_roster: Array<{
      status: string;
      talent_profiles: { is_discoverable: boolean | null; workflow_status: string | null } | null;
    }> | null;
  };
  const rows = (data ?? []) as unknown as Row[];

  return rows
    .map((row): DiscoverHub | null => {
      const planTier = row.plan_tier;
      if (planTier !== "studio" && planTier !== "agency" && planTier !== "network") return null;
      const roster = row.agency_talent_roster ?? [];
      const discoverableTalentCount = roster.filter((r) => {
        if (r.status !== "active" && r.status !== "pending") return false;
        const p = r.talent_profiles;
        if (!p) return false;
        if (!p.is_discoverable) return false;
        return p.workflow_status === "approved" || p.workflow_status === "published";
      }).length;
      return {
        id: row.id,
        displayName: (row.display_name ?? "").trim() || "Unnamed hub",
        planTier,
        discoverableTalentCount,
      };
    })
    .filter((h): h is DiscoverHub => h !== null)
    .filter((h) => h.discoverableTalentCount > 0)
    .sort((a, b) => b.discoverableTalentCount - a.discoverableTalentCount
                 || a.displayName.localeCompare(b.displayName));
}
