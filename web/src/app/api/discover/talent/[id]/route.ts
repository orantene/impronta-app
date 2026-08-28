// D2 — Discover single-talent detail endpoint.
//
// GET /api/discover/talent/:id
//   → 200 { talent: DiscoverTalentDetail }
//   → 401 unauthenticated
//   → 404 not found OR not discoverable (talent must have is_discoverable=true)
//
// Returns expanded detail beyond the list-item shape — for the card →
// drawer transition on the buyer surface. Adds bio, secondary type
// labels, languages, gallery URLs. Direct URL knowledge does NOT bypass
// the opt-in: a talent who toggled `is_discoverable` off 404s even if
// the client previously knew their id.
//
// See: web/docs/discover-and-unified-inquiry-2026-05-14.md §7.

import { NextResponse } from "next/server";
import { getCachedActorSession } from "@/lib/server/request-cache";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError } from "@/lib/server/safe-error";
import { readScalarFieldValuesFromCatalog } from "@/lib/talent/scalar-field-values-catalog";

export const dynamic = "force-dynamic";

export type DiscoverTalentDetail = {
  id: string;
  displayName: string;
  profileCode: string | null;
  primaryTypeLabel: string | null;
  primaryTypeSlug: string | null;
  secondaryTypeLabels: string[];
  homeCity: string | null;
  homeCountry: string | null;
  agencyName: string | null;
  agencyTenantId: string | null;
  isExclusive: boolean;
  /** Short bio (first non-empty of short_bio, bio_i18n.en). */
  bio: string | null;
  /** Talent's stated response-time SLA. */
  responseTime: "1h" | "4h" | "24h" | "48h" | null;
  /** Languages spoken — language code list. */
  languages: string[];
  /** Public URL of the talent's card-variant photo (or fallback). */
  headshotUrl: string | null;
  /** Up to 8 gallery photo URLs (variant_kind chain — same as headshot fallback). */
  galleryUrls: string[];
};

// Enum: original, card, gallery, banner, lightbox, public_watermarked, watermarked, hero.
const PHOTO_VARIANT_PRIORITY = ["hero", "card", "public_watermarked", "watermarked", "gallery", "original"];
const GALLERY_MAX = 8;

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getCachedActorSession();
  if (!session.user) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  const { id } = await params;
  if (!id) {
    return NextResponse.json({ error: "missing_id" }, { status: 400 });
  }

  const admin = createServiceRoleClient();
  if (!admin) {
    return NextResponse.json({ error: "service_unavailable" }, { status: 503 });
  }

  const { data, error } = await admin
    .from("talent_profiles")
    .select(
      `
      id, display_name, first_name, last_name, profile_code,
      home_country_text, home_city_text,
      workflow_status, is_discoverable, profile_kind,
      short_bio, bio_i18n,
      talent_profile_taxonomy (
        relationship_type,
        taxonomy_terms ( name_i18n, slug )
      ),
      agency_talent_roster!talent_profile_id (
        tenant_id, status, is_primary,
        agencies!tenant_id ( display_name )
      ),
      talent_languages ( language_code, language_name )
      `,
    )
    .eq("id", id)
    .maybeSingle();

  if (error) {
    logServerError("api.discover.talent.detail", error);
    return NextResponse.json({ error: "query_failed" }, { status: 500 });
  }

  if (!data) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  type Row = {
    id: string;
    display_name: string | null;
    first_name: string | null;
    last_name: string | null;
    profile_code: string | null;
    home_country_text: string | null;
    home_city_text: string | null;
    workflow_status: string | null;
    is_discoverable: boolean | null;
    profile_kind: string | null;
    short_bio: string | null;
    bio_i18n: Record<string, string | null> | null;
    talent_profile_taxonomy: Array<{
      relationship_type: string | null;
      taxonomy_terms: { name_i18n: Record<string, string | null> | null; slug: string | null } | null;
    }> | null;
    agency_talent_roster: Array<{
      tenant_id: string;
      status: string;
      is_primary: boolean;
      agencies: { display_name: string | null } | { display_name: string | null }[] | null;
    }> | null;
    talent_languages: Array<{ language_code: string | null; language_name: string | null }> | null;
  };

  const row = data as unknown as Row;

  // Enforce opt-in: a talent who hasn't toggled is_discoverable on stays
  // hidden even if the client previously knew their id.
  const workflowOk = row.workflow_status === "approved" || row.workflow_status === "published";
  if (!row.is_discoverable || !workflowOk || row.profile_kind === "resource") {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const displayName =
    (row.display_name ?? "").trim()
    || `${row.first_name ?? ""} ${row.last_name ?? ""}`.trim()
    || "Unnamed";

  const tax = row.talent_profile_taxonomy ?? [];
  const primaryTerm = tax.find((t) => t.relationship_type === "primary_role");
  const primaryTypeLabel = primaryTerm?.taxonomy_terms?.name_i18n?.en ?? null;
  const primaryTypeSlug = primaryTerm?.taxonomy_terms?.slug ?? null;
  const secondaryTypeLabels = tax
    .filter((t) => t.relationship_type === "secondary_role")
    .map((t) => t.taxonomy_terms?.name_i18n?.en)
    .filter((l): l is string => Boolean(l));

  const roster = row.agency_talent_roster ?? [];
  const activeRoster = roster.filter((r) => r.status === "active" || r.status === "pending");
  const primaryRoster = activeRoster.find((r) => r.is_primary) ?? null;
  const agencyRowOrArr = primaryRoster?.agencies;
  const agencyRow = Array.isArray(agencyRowOrArr) ? agencyRowOrArr[0] : agencyRowOrArr;

  const bio = (row.short_bio?.trim() || row.bio_i18n?.en?.trim()) || null;

  // T4 collapse-dedicated-columns: response_time is sourced from System B
  // (`talent_profile_field_values`) — its dedicated talent_profiles column was
  // dropped. Read-only; errors fall back to null inside the helper.
  const scalarValues = await readScalarFieldValuesFromCatalog(admin, row.id);
  const responseTimeRaw = scalarValues.response_time ?? null;
  const responseTime: DiscoverTalentDetail["responseTime"] =
    responseTimeRaw === "1h" || responseTimeRaw === "4h"
      || responseTimeRaw === "24h" || responseTimeRaw === "48h"
      ? responseTimeRaw
      : null;

  const languages = (row.talent_languages ?? [])
    .map((l) => l.language_name || l.language_code)
    .filter((l): l is string => Boolean(l));

  // Fetch gallery — separate query because the join above is already wide.
  const { data: mediaRows } = await admin
    .from("media_assets")
    .select("storage_path, variant_kind, sort_order")
    .eq("owner_talent_profile_id", row.id)
    .in("variant_kind", PHOTO_VARIANT_PRIORITY)
    .is("deleted_at", null)
    .order("sort_order", { ascending: true });

  const galleryUrls: string[] = [];
  let headshotUrl: string | null = null;
  if (mediaRows) {
    const sorted = (mediaRows as Array<{ storage_path: string; variant_kind: string }>)
      .slice()
      .sort((a, b) => PHOTO_VARIANT_PRIORITY.indexOf(a.variant_kind) - PHOTO_VARIANT_PRIORITY.indexOf(b.variant_kind));
    for (const m of sorted) {
      const url =
        m.storage_path.startsWith("http") || m.storage_path.startsWith("/")
        ? m.storage_path
        : admin.storage.from("media-public").getPublicUrl(m.storage_path).data.publicUrl;
      if (!headshotUrl) headshotUrl = url;
      if (galleryUrls.length < GALLERY_MAX) galleryUrls.push(url);
    }
  }

  const talent: DiscoverTalentDetail = {
    id: row.id,
    displayName,
    profileCode: row.profile_code,
    primaryTypeLabel,
    primaryTypeSlug,
    secondaryTypeLabels,
    homeCity: row.home_city_text,
    homeCountry: row.home_country_text,
    agencyName: agencyRow?.display_name ?? null,
    agencyTenantId: primaryRoster?.tenant_id ?? null,
    isExclusive: !!primaryRoster?.is_primary,
    bio,
    responseTime,
    languages,
    headshotUrl,
    galleryUrls,
  };

  return NextResponse.json({ talent });
}
