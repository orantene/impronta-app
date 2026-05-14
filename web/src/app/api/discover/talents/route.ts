// D2 — Discover talents endpoint (cross-tenant browse).
//
// GET /api/discover/talents?country=&q=&limit=24&offset=0
//   → 200 { items: DiscoverTalentItem[], total: number, limit, offset }
//   → 401 unauthenticated
//
// Auth: any logged-in user. Discover Standard (free tier) baseline access.
// Trust-gated actions (inquire, contact) fire later — not at browse time.
//
// Cross-tenant read uses service-role client. RLS on talent_profiles would
// restrict to tenant-staff or self; Discover surfaces is_discoverable=true
// talents to any authenticated client, so we bypass RLS by design. Only
// public-safe fields are exposed (display_name, profile_code, home city,
// primary category, agency display name, headshot URL).
//
// See: web/docs/discover-and-unified-inquiry-2026-05-14.md §7 (engine API).

import { NextResponse } from "next/server";
import { getCachedActorSession } from "@/lib/server/request-cache";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError } from "@/lib/server/safe-error";

export const dynamic = "force-dynamic";

export type DiscoverTalentItem = {
  /** talent_profiles.id */
  id: string;
  /** Best-effort display name (display_name → first+last → "Unnamed"). */
  displayName: string;
  /** Public profile slug — link to tulala.digital/t/<profileCode>. */
  profileCode: string | null;
  /** Primary taxonomy term label (e.g. "Fashion Model"). */
  primaryTypeLabel: string | null;
  /** Primary taxonomy term slug — for category filter UI. */
  primaryTypeSlug: string | null;
  /** Free-form home city text. Place ID resolution comes later (D9 polish). */
  homeCity: string | null;
  /** Country label. */
  homeCountry: string | null;
  /** Agency display name when the talent has a primary roster; null = independent. */
  agencyName: string | null;
  /** tenant_id of the primary agency for badge/click routing. */
  agencyTenantId: string | null;
  /** True when the talent has is_primary=TRUE on a roster — "exclusive" to that agency. */
  isExclusive: boolean;
  /** Public URL of the talent's card-variant photo (or fallback through the variant chain). */
  headshotUrl: string | null;
};

const PHOTO_VARIANT_PRIORITY = ["card", "public_watermarked", "gallery", "portfolio", "original"];

export async function GET(req: Request) {
  const session = await getCachedActorSession();
  if (!session.user) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  const url = new URL(req.url);
  const country = url.searchParams.get("country");
  const q = url.searchParams.get("q");
  const category = url.searchParams.get("category");
  const limitRaw = parseInt(url.searchParams.get("limit") ?? "24", 10);
  const offsetRaw = parseInt(url.searchParams.get("offset") ?? "0", 10);
  const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 60) : 24;
  const offset = Number.isFinite(offsetRaw) ? Math.max(offsetRaw, 0) : 0;

  const admin = createServiceRoleClient();
  if (!admin) {
    return NextResponse.json({ items: [], total: 0, limit, offset });
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

  if (country) query = query.eq("home_country_text", country);
  if (q) query = query.ilike("display_name", `%${q}%`);

  const { data, error, count } = await query;
  if (error) {
    logServerError("api.discover.talents", error);
    return NextResponse.json({ error: "query_failed" }, { status: 500 });
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

  // Server-side category filter — done in memory because the join is nested.
  const filteredRows = category
    ? rows.filter((r) => {
        const tax = r.talent_profile_taxonomy ?? [];
        return tax.some(
          (t) => t.relationship_type === "primary_role" && t.taxonomy_terms?.slug === category,
        );
      })
    : rows;

  // Batch-fetch card photos for the page.
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
    for (const row of (photos ?? []) as Array<{
      owner_talent_profile_id: string;
      storage_path: string;
      variant_kind: string;
    }>) {
      const rank = PHOTO_VARIANT_PRIORITY.indexOf(row.variant_kind);
      if (rank < 0) continue;
      const current = bestRank.get(row.owner_talent_profile_id);
      if (current === undefined || rank < current) {
        bestRank.set(row.owner_talent_profile_id, rank);
        const publicUrl = admin.storage.from("media-public").getPublicUrl(row.storage_path).data.publicUrl;
        photoByTalent.set(row.owner_talent_profile_id, publicUrl);
      }
    }
  }

  const items: DiscoverTalentItem[] = filteredRows.map((row) => {
    const displayName =
      (row.display_name ?? "").trim()
      || `${row.first_name ?? ""} ${row.last_name ?? ""}`.trim()
      || "Unnamed";

    const tax = row.talent_profile_taxonomy ?? [];
    const primaryTerm = tax.find((t) => t.relationship_type === "primary_role");
    const primaryTypeLabel = primaryTerm?.taxonomy_terms?.name_en ?? null;
    const primaryTypeSlug = primaryTerm?.taxonomy_terms?.slug ?? null;

    const roster = row.agency_talent_roster ?? [];
    const activeRoster = roster.filter((r) => r.status === "active" || r.status === "pending");
    const primaryRoster = activeRoster.find((r) => r.is_primary) ?? null;
    const agencyRowOrArr = primaryRoster?.agencies;
    const agencyRow = Array.isArray(agencyRowOrArr) ? agencyRowOrArr[0] : agencyRowOrArr;

    return {
      id: row.id,
      displayName,
      profileCode: row.profile_code,
      primaryTypeLabel,
      primaryTypeSlug,
      homeCity: row.home_city_text,
      homeCountry: row.home_country_text,
      agencyName: agencyRow?.display_name ?? null,
      agencyTenantId: primaryRoster?.tenant_id ?? null,
      isExclusive: !!primaryRoster?.is_primary,
      headshotUrl: photoByTalent.get(row.id) ?? null,
    };
  });

  return NextResponse.json({
    items,
    total: count ?? items.length,
    limit,
    offset,
  });
}
