// D4 slice 1 — list client's favorite talents.
//
// GET /api/discover/favorites
//   → 200 { favorites: DiscoverFavorite[] }
//   → 401 unauthenticated
//
// Returns the signed-in client's heart-saved talents, newest first.
// Each entry carries enough card-level data for the favorites pane to
// render without a second roundtrip per row.
//
// Mutations live on /api/discover/favorites/:talentId.

import { NextResponse } from "next/server";
import { getCachedActorSession } from "@/lib/server/request-cache";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError } from "@/lib/server/safe-error";

export const dynamic = "force-dynamic";

export type DiscoverFavorite = {
  talentId: string;
  addedAt: string;
  displayName: string;
  profileCode: string | null;
  primaryTypeLabel: string | null;
  homeCity: string | null;
  homeCountry: string | null;
  agencyName: string | null;
  isExclusive: boolean;
  headshotUrl: string | null;
};

// Enum: original, card, gallery, banner, lightbox, public_watermarked, watermarked, hero.
const PHOTO_VARIANT_PRIORITY = ["hero", "card", "public_watermarked", "watermarked", "gallery", "original"];

export async function GET() {
  const session = await getCachedActorSession();
  if (!session.user) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  const admin = createServiceRoleClient();
  if (!admin) return NextResponse.json({ favorites: [] });

  const { data: rows, error } = await admin
    .from("client_favorites")
    .select(
      `
      added_at,
      talent_profile_id,
      talent_profiles (
        id, display_name, first_name, last_name, profile_code,
        home_country_text, home_city_text,
        is_discoverable, workflow_status,
        agency_talent_roster!talent_profile_id (
          tenant_id, status, is_primary,
          agencies!tenant_id ( display_name )
        )
      )
      `,
    )
    .eq("client_user_id", session.user.id)
    .order("added_at", { ascending: false });

  if (error) {
    logServerError("api.discover.favorites.list", error);
    return NextResponse.json({ error: "query_failed" }, { status: 500 });
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
      agency_talent_roster: Array<{
        tenant_id: string;
        status: string;
        is_primary: boolean;
        agencies: { display_name: string | null } | { display_name: string | null }[] | null;
      }> | null;
    } | null;
  };

  const data = (rows ?? []) as unknown as Row[];

  // Batch-fetch card photos for everyone present.
  const ids = data.map((r) => r.talent_profile_id);
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

  const favorites: DiscoverFavorite[] = data
    .map((row): DiscoverFavorite | null => {
      const p = row.talent_profiles;
      if (!p) return null;
      const displayName =
        (p.display_name ?? "").trim()
        || `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim()
        || "Unnamed";
      const tax: never[] = [];
      void tax;
      const roster = p.agency_talent_roster ?? [];
      const activeRoster = roster.filter((r) => r.status === "active" || r.status === "pending");
      const primaryRoster = activeRoster.find((r) => r.is_primary) ?? null;
      const agencyRowOrArr = primaryRoster?.agencies;
      const agencyRow = Array.isArray(agencyRowOrArr) ? agencyRowOrArr[0] : agencyRowOrArr;
      return {
        talentId: p.id,
        addedAt: row.added_at,
        displayName,
        profileCode: p.profile_code,
        primaryTypeLabel: null, // taxonomy not joined here; favorites pane keeps it lean
        homeCity: p.home_city_text,
        homeCountry: p.home_country_text,
        agencyName: agencyRow?.display_name ?? null,
        isExclusive: !!primaryRoster?.is_primary,
        headshotUrl: photoByTalent.get(p.id) ?? null,
      };
    })
    .filter((f): f is DiscoverFavorite => f !== null);

  return NextResponse.json({ favorites });
}
