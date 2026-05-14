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

export type LoadDiscoverTalentsOpts = {
  country?: string;
  category?: string;
  q?: string;
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
