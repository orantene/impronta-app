/**
 * POST /api/directory/talents-by-ids
 *
 * Public batch lookup — given a list of `talent_profiles.id` values,
 * returns minimal card data ({ id, displayName, profileCode, photoUrl,
 * primaryTypeLabel, locationLabel }) so client drawers (favorites,
 * compare, etc.) can render without N round-trips.
 *
 * Public-safe: only fields already on `/api/directory` SSR seed are
 * returned. Discoverability gate enforced — non-discoverable talents
 * are dropped.
 */

import { NextResponse } from "next/server";

import { logServerError } from "@/lib/server/safe-error";
import { createServiceRoleClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

type RequestBody = {
  ids?: string[];
};

export type DirectoryTalentMini = {
  id: string;
  displayName: string;
  profileCode: string | null;
  primaryTypeLabel: string | null;
  locationLabel: string | null;
  photoUrl: string | null;
};

// Egress hygiene: "original" is intentionally excluded. Originals can be
// 5–15 MB raw camera files; serving them as a fallback bypasses every
// resize / optimizer downstream and dominates Supabase storage egress.
// A missing variant should render the placeholder, not the full-res raw.
const PHOTO_VARIANT_PRIORITY = [
  "hero",
  "card",
  "public_watermarked",
  "watermarked",
  "gallery",
];

const MAX_IDS = 200;

export async function POST(req: Request) {
  let body: RequestBody = {};
  try {
    body = (await req.json()) as RequestBody;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const rawIds = Array.isArray(body.ids) ? body.ids : [];
  const ids = Array.from(
    new Set(
      rawIds.filter((x): x is string => typeof x === "string" && x.length > 0),
    ),
  ).slice(0, MAX_IDS);

  if (ids.length === 0) {
    return NextResponse.json({ talents: [] });
  }

  const admin = createServiceRoleClient();
  if (!admin) return NextResponse.json({ talents: [] });

  const { data: profiles, error } = await admin
    .from("talent_profiles")
    .select(
      `
      id, display_name, first_name, last_name, profile_code,
      home_country_text, home_city_text,
      is_discoverable, workflow_status
      `,
    )
    .in("id", ids);

  if (error) {
    logServerError("api.directory.talents-by-ids.list", error);
    return NextResponse.json({ error: "query_failed" }, { status: 500 });
  }

  type ProfileRow = {
    id: string;
    display_name: string | null;
    first_name: string | null;
    last_name: string | null;
    profile_code: string | null;
    home_country_text: string | null;
    home_city_text: string | null;
    is_discoverable: boolean | null;
    workflow_status: string | null;
  };

  const rows = ((profiles ?? []) as unknown as ProfileRow[]).filter(
    (p) => p.is_discoverable !== false,
  );

  // Batch-load best photo per talent.
  const photoByTalent = new Map<string, string>();
  if (rows.length > 0) {
    const { data: photos } = await admin
      .from("media_assets")
      .select("owner_talent_profile_id, storage_path, variant_kind")
      .in(
        "owner_talent_profile_id",
        rows.map((r) => r.id),
      )
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
          : admin.storage
              .from("media-public")
              .getPublicUrl(m.storage_path).data.publicUrl;
        photoByTalent.set(m.owner_talent_profile_id, url);
      }
    }
  }

  // Preserve the order the client requested.
  const byId = new Map(rows.map((r) => [r.id, r] as const));

  const talents: DirectoryTalentMini[] = ids
    .map((id): DirectoryTalentMini | null => {
      const p = byId.get(id);
      if (!p) return null;
      const displayName =
        (p.display_name ?? "").trim() ||
        `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim() ||
        "Unnamed";
      const cityCountry = [p.home_city_text, p.home_country_text]
        .filter((s): s is string => typeof s === "string" && s.trim().length > 0)
        .join(", ");
      return {
        id: p.id,
        displayName,
        profileCode: p.profile_code,
        primaryTypeLabel: null,
        locationLabel: cityCountry || null,
        photoUrl: photoByTalent.get(p.id) ?? null,
      };
    })
    .filter((t): t is DirectoryTalentMini => t !== null);

  return NextResponse.json({ talents });
}
