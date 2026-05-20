import "server-only";

import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError } from "@/lib/server/safe-error";

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

// Order = best-first. Enum values per media_variant_kind:
//   original, card, gallery, banner, lightbox, public_watermarked, watermarked, hero
// "hero" is the talent-side 4:5 cover (project_talent_surface_launch.md);
// "card" is the curated thumbnail. Both work as primary; we prefer hero.
const PHOTO_VARIANT_PRIORITY = ["hero", "card", "public_watermarked", "watermarked", "gallery", "original"];

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

export type LoadDiscoverTalentsOpts = {
  country?: string;
  category?: string;
  q?: string;
  /** Filter to talents whose primary roster is on this tenant (= agency hub). */
  hub?: string;
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
       trust_tier`,
      { count: "exact" },
    )
    .order("display_name", { ascending: true, nullsFirst: false })
    .range(offset, offset + limit - 1);

  if (opts.country)  query = query.eq("home_country_text", opts.country);
  if (opts.category) query = query.eq("category_slug", opts.category);
  if (opts.hub)      query = query.eq("agency_tenant_id", opts.hub);
  if (opts.q)        query = query.ilike("display_name", `%${opts.q}%`);

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
  const photoByTalent = new Map<string, string>();
  const coordsByCityId = new Map<string, { lat: number | null; lng: number | null }>();

  if (ids.length > 0) {
    // Photos.
    const { data: photos } = await admin
      .from("media_assets")
      .select("owner_talent_profile_id, storage_path, variant_kind")
      .in("owner_talent_profile_id", ids)
      .in("variant_kind", PHOTO_VARIANT_PRIORITY)
      .is("deleted_at", null);

    const bestRank = new Map<string, number>();
    for (const m of (photos ?? []) as Array<{
      owner_talent_profile_id: string;
      storage_path: string;
      variant_kind: string;
    }>) {
      const rank = PHOTO_VARIANT_PRIORITY.indexOf(m.variant_kind);
      if (rank < 0) continue;
      const current = bestRank.get(m.owner_talent_profile_id);
      if (current === undefined || rank < current) {
        bestRank.set(m.owner_talent_profile_id, rank);
        const url = m.storage_path.startsWith("http")
          ? m.storage_path
          : admin.storage.from("media-public").getPublicUrl(m.storage_path).data.publicUrl;
        photoByTalent.set(m.owner_talent_profile_id, url);
      }
    }

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
    };
  });

  return { items, total: count ?? items.length };
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
        taxonomy_terms ( name_en, slug )
      )
      `,
    )
    .eq("is_discoverable", true)
    .in("workflow_status", ["approved", "published"]);

  if (error) {
    logServerError("workspace.loadDiscoverFacets", error);
    return { countries: [], categories: [] };
  }

  type Row = {
    home_country_text: string | null;
    talent_profile_taxonomy: Array<{
      relationship_type: string | null;
      taxonomy_terms: { name_en: string | null; slug: string | null } | null;
    }> | null;
  };

  const rows = (data ?? []) as unknown as Row[];
  const countryCounts = new Map<string, number>();
  const categoryCounts = new Map<string, { label: string; count: number }>();

  for (const row of rows) {
    const country = row.home_country_text?.trim();
    if (country) {
      countryCounts.set(country, (countryCounts.get(country) ?? 0) + 1);
    }
    const tax = row.talent_profile_taxonomy ?? [];
    const primary = tax.find((t) => t.relationship_type === "primary_role");
    const slug = primary?.taxonomy_terms?.slug?.trim();
    const label = primary?.taxonomy_terms?.name_en?.trim();
    if (slug && label) {
      const existing = categoryCounts.get(slug);
      categoryCounts.set(slug, {
        label: existing?.label ?? label,
        count: (existing?.count ?? 0) + 1,
      });
    }
  }

  return {
    countries: Array.from(countryCounts.entries())
      .map(([value, count]) => ({ value, count }))
      .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value)),
    categories: Array.from(categoryCounts.entries())
      .map(([value, { label, count }]) => ({ value, label, count }))
      .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label)),
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
          id, display_name, first_name, last_name,
          home_country_text, home_city_text,
          is_discoverable, workflow_status,
          talent_profile_taxonomy (
            relationship_type,
            taxonomy_terms ( name_en )
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
        home_country_text: string | null;
        home_city_text: string | null;
        is_discoverable: boolean | null;
        workflow_status: string | null;
        talent_profile_taxonomy: Array<{
          relationship_type: string | null;
          taxonomy_terms: { name_en: string | null } | null;
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

  const photoByTalent = new Map<string, string>();
  if (allTalentIds.size > 0) {
    const { data: photos } = await admin
      .from("media_assets")
      .select("owner_talent_profile_id, storage_path, variant_kind")
      .in("owner_talent_profile_id", Array.from(allTalentIds))
      .in("variant_kind", PHOTO_VARIANT_PRIORITY)
      .is("deleted_at", null);

    const bestRank = new Map<string, number>();
    for (const m of (photos ?? []) as Array<{
      owner_talent_profile_id: string;
      storage_path: string;
      variant_kind: string;
    }>) {
      const rank = PHOTO_VARIANT_PRIORITY.indexOf(m.variant_kind);
      if (rank < 0) continue;
      const current = bestRank.get(m.owner_talent_profile_id);
      if (current === undefined || rank < current) {
        bestRank.set(m.owner_talent_profile_id, rank);
        photoByTalent.set(
          m.owner_talent_profile_id,
          admin.storage.from("media-public").getPublicUrl(m.storage_path).data.publicUrl,
        );
      }
    }
  }

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
          ?.taxonomy_terms?.name_en ?? null;
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

  const photoByTalent = new Map<string, string>();
  if (talentIds.size > 0) {
    const { data: photos } = await admin
      .from("media_assets")
      .select("owner_talent_profile_id, storage_path, variant_kind")
      .in("owner_talent_profile_id", Array.from(talentIds))
      .in("variant_kind", PHOTO_VARIANT_PRIORITY)
      .is("deleted_at", null);
    const bestRank = new Map<string, number>();
    for (const m of (photos ?? []) as Array<{
      owner_talent_profile_id: string;
      storage_path: string;
      variant_kind: string;
    }>) {
      const rank = PHOTO_VARIANT_PRIORITY.indexOf(m.variant_kind);
      if (rank < 0) continue;
      const current = bestRank.get(m.owner_talent_profile_id);
      if (current === undefined || rank < current) {
        bestRank.set(m.owner_talent_profile_id, rank);
        const url = m.storage_path.startsWith("http")
          ? m.storage_path
          : admin.storage.from("media-public").getPublicUrl(m.storage_path).data.publicUrl;
        photoByTalent.set(m.owner_talent_profile_id, url);
      }
    }
  }

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
        id, display_name, first_name, last_name,
        home_country_text, home_city_text,
        is_discoverable, workflow_status,
        talent_profile_taxonomy (
          relationship_type,
          taxonomy_terms ( name_en )
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
      home_country_text: string | null;
      home_city_text: string | null;
      is_discoverable: boolean | null;
      workflow_status: string | null;
      talent_profile_taxonomy: Array<{
        relationship_type: string | null;
        taxonomy_terms: { name_en: string | null } | null;
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
  const photoByTalent = new Map<string, string>();
  if (ids.length > 0) {
    const { data: photos } = await admin
      .from("media_assets")
      .select("owner_talent_profile_id, storage_path, variant_kind")
      .in("owner_talent_profile_id", ids)
      .in("variant_kind", PHOTO_VARIANT_PRIORITY)
      .is("deleted_at", null);

    const bestRank = new Map<string, number>();
    for (const m of (photos ?? []) as Array<{
      owner_talent_profile_id: string;
      storage_path: string;
      variant_kind: string;
    }>) {
      const rank = PHOTO_VARIANT_PRIORITY.indexOf(m.variant_kind);
      if (rank < 0) continue;
      const current = bestRank.get(m.owner_talent_profile_id);
      if (current === undefined || rank < current) {
        bestRank.set(m.owner_talent_profile_id, rank);
        const url = m.storage_path.startsWith("http")
          ? m.storage_path
          : admin.storage.from("media-public").getPublicUrl(m.storage_path).data.publicUrl;
        photoByTalent.set(m.owner_talent_profile_id, url);
      }
    }
  }

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
        ?.taxonomy_terms?.name_en ?? null;
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
