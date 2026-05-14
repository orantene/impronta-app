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

const PHOTO_VARIANT_PRIORITY = ["card", "public_watermarked", "gallery", "portfolio", "original"];

export type DiscoverTalentListItem = {
  id: string;
  displayName: string;
  profileCode: string | null;
  primaryTypeLabel: string | null;
  primaryTypeSlug: string | null;
  homeCity: string | null;
  homeCountry: string | null;
  agencyName: string | null;
  agencyTenantId: string | null;
  isExclusive: boolean;
  headshotUrl: string | null;
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

  // Hub filter — two-step to keep the relation filter clean.
  let hubFilterIds: string[] | null = null;
  if (opts.hub) {
    const { data: hubRoster } = await admin
      .from("agency_talent_roster")
      .select("talent_profile_id")
      .eq("tenant_id", opts.hub)
      .eq("is_primary", true)
      .in("status", ["active", "pending"]);
    hubFilterIds = (hubRoster ?? []).map((r) => r.talent_profile_id as string);
    if (hubFilterIds.length === 0) return { items: [], total: 0 };
  }

  let query = admin
    .from("talent_profiles")
    .select(
      `
      id, display_name, first_name, last_name, profile_code,
      home_country_text, home_city_text,
      workflow_status, is_discoverable,
      talent_profile_taxonomy (
        relationship_type,
        taxonomy_terms ( name_en, slug )
      ),
      agency_talent_roster!talent_profile_id (
        tenant_id, status, is_primary,
        agencies!tenant_id ( display_name )
      )
      `,
      { count: "exact" },
    )
    .eq("is_discoverable", true)
    .in("workflow_status", ["approved", "published"])
    .order("display_name", { ascending: true, nullsFirst: false })
    .range(offset, offset + limit - 1);

  if (opts.country) query = query.eq("home_country_text", opts.country);
  if (opts.q) query = query.ilike("display_name", `%${opts.q}%`);
  if (hubFilterIds) query = query.in("id", hubFilterIds);

  const { data, error, count } = await query;
  if (error) {
    logServerError("workspace.loadDiscoverTalents", error);
    return { items: [], total: 0 };
  }

  type Row = {
    id: string;
    display_name: string | null;
    first_name: string | null;
    last_name: string | null;
    profile_code: string | null;
    home_country_text: string | null;
    home_city_text: string | null;
    talent_profile_taxonomy: Array<{
      relationship_type: string | null;
      taxonomy_terms: { name_en: string | null; slug: string | null } | null;
    }> | null;
    agency_talent_roster: Array<{
      tenant_id: string;
      status: string;
      is_primary: boolean;
      agencies: { display_name: string | null } | { display_name: string | null }[] | null;
    }> | null;
  };

  const rows = (data ?? []) as unknown as Row[];
  const filteredRows = opts.category
    ? rows.filter((r) => {
        const tax = r.talent_profile_taxonomy ?? [];
        return tax.some(
          (t) => t.relationship_type === "primary_role" && t.taxonomy_terms?.slug === opts.category,
        );
      })
    : rows;

  const ids = filteredRows.map((r) => r.id);
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
        const url = admin.storage.from("media-public").getPublicUrl(m.storage_path).data.publicUrl;
        photoByTalent.set(m.owner_talent_profile_id, url);
      }
    }
  }

  const items: DiscoverTalentListItem[] = filteredRows.map((row) => {
    const displayName =
      (row.display_name ?? "").trim()
      || `${row.first_name ?? ""} ${row.last_name ?? ""}`.trim()
      || "Unnamed";

    const tax = row.talent_profile_taxonomy ?? [];
    const primaryTerm = tax.find((t) => t.relationship_type === "primary_role");
    const roster = row.agency_talent_roster ?? [];
    const activeRoster = roster.filter((r) => r.status === "active" || r.status === "pending");
    const primaryRoster = activeRoster.find((r) => r.is_primary) ?? null;
    const agencyRowOrArr = primaryRoster?.agencies;
    const agencyRow = Array.isArray(agencyRowOrArr) ? agencyRowOrArr[0] : agencyRowOrArr;

    return {
      id: row.id,
      displayName,
      profileCode: row.profile_code,
      primaryTypeLabel: primaryTerm?.taxonomy_terms?.name_en ?? null,
      primaryTypeSlug: primaryTerm?.taxonomy_terms?.slug ?? null,
      homeCity: row.home_city_text,
      homeCountry: row.home_country_text,
      agencyName: agencyRow?.display_name ?? null,
      agencyTenantId: primaryRoster?.tenant_id ?? null,
      isExclusive: !!primaryRoster?.is_primary,
      headshotUrl: photoByTalent.get(row.id) ?? null,
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
