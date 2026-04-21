import { ImageResponse } from "next/og";
import { createPublicSupabaseClient } from "@/lib/supabase/public";

// Phase 5/6 M5 — growth hooks: link-preview card for /t/[code].
// Keeps the public canonical surface shareable on WhatsApp / X / iMessage
// with a branded preview instead of a blank OG default. Data access is
// anon-only (RLS: approved + public + not-deleted) and the route is
// statically optimized by Next 16 based on the data dependencies.

export const alt = "Impronta talent profile";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

type TaxonomyTerm = {
  kind: string;
  name_en: string;
};

type TaxonomyRow = {
  is_primary: boolean | null;
  taxonomy_terms: TaxonomyTerm | TaxonomyTerm[] | null;
};

type MediaAsset = {
  bucket_id: string | null;
  storage_path: string | null;
};

type OgProfile = {
  display_name: string | null;
  first_name: string | null;
  last_name: string | null;
  profile_code: string;
  talent_profile_taxonomy: TaxonomyRow[] | null;
};

function displayNameOf(p: OgProfile): string {
  const name = p.display_name?.trim();
  if (name) return name;
  const composed = [p.first_name, p.last_name].filter(Boolean).join(" ").trim();
  return composed || p.profile_code;
}

function primaryTalentType(rows: TaxonomyRow[] | null): string | null {
  if (!rows) return null;
  let fallback: string | null = null;
  for (const row of rows) {
    const terms = row.taxonomy_terms
      ? Array.isArray(row.taxonomy_terms)
        ? row.taxonomy_terms
        : [row.taxonomy_terms]
      : [];
    for (const term of terms) {
      if (term.kind !== "talent_type") continue;
      if (row.is_primary) return term.name_en;
      if (!fallback) fallback = term.name_en;
    }
  }
  return fallback;
}

export default async function Image({
  params,
}: {
  params: Promise<{ profileCode: string }>;
}) {
  const { profileCode } = await params;
  const supabase = createPublicSupabaseClient();

  let profile: OgProfile | null = null;
  let heroUrl: string | null = null;

  if (supabase) {
    const { data } = await supabase
      .from("talent_profiles")
      .select(
        `id, profile_code, display_name, first_name, last_name,
         talent_profile_taxonomy ( is_primary, taxonomy_terms ( kind, name_en ) )`,
      )
      .eq("profile_code", profileCode)
      .eq("workflow_status", "approved")
      .eq("visibility", "public")
      .is("deleted_at", null)
      .maybeSingle();
    profile = (data as unknown as (OgProfile & { id: string }) | null) ?? null;

    if (profile) {
      const row = data as { id: string } | null;
      if (row) {
        const { data: media } = await supabase
          .from("media_assets")
          .select("bucket_id, storage_path, variant_kind, sort_order")
          .eq("owner_talent_profile_id", row.id)
          .in("variant_kind", ["card", "public_watermarked", "gallery"])
          .eq("approval_state", "approved")
          .is("deleted_at", null)
          .order("sort_order", { ascending: true })
          .limit(3);
        const pick =
          (media as MediaAsset[] | null)?.find(Boolean) ?? null;
        if (pick?.bucket_id && pick.storage_path) {
          heroUrl = supabase.storage
            .from(pick.bucket_id)
            .getPublicUrl(pick.storage_path).data.publicUrl;
        }
      }
    }
  }

  const name = profile ? displayNameOf(profile) : profileCode;
  const talentType = profile
    ? primaryTalentType(profile.talent_profile_taxonomy)
    : null;
  const code = profile?.profile_code ?? profileCode;

  const gold = "#9b7a21";
  const goldBright = "#b18a24";
  const goldDim = "#7b6424";
  const surface = "#fffdf8";
  const ink = "#1a1a1a";
  const muted = "#6b6b6b";

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          background: surface,
          fontFamily: "sans-serif",
        }}
      >
        {/* Left: identity */}
        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            padding: "64px 72px",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 14,
              fontSize: 22,
              letterSpacing: 8,
              textTransform: "uppercase",
              color: goldDim,
              fontWeight: 500,
            }}
          >
            <div
              style={{
                width: 38,
                height: 1,
                background: goldBright,
              }}
            />
            Impronta
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
            {talentType ? (
              <div
                style={{
                  fontSize: 22,
                  letterSpacing: 6,
                  textTransform: "uppercase",
                  color: gold,
                  fontWeight: 500,
                }}
              >
                {talentType}
              </div>
            ) : null}
            <div
              style={{
                fontSize: 72,
                lineHeight: 1.05,
                color: ink,
                fontWeight: 400,
                letterSpacing: -0.5,
                maxWidth: 580,
              }}
            >
              {name}
            </div>
          </div>

          <div
            style={{
              fontSize: 20,
              letterSpacing: 4,
              textTransform: "uppercase",
              color: muted,
            }}
          >
            {code}
          </div>
        </div>

        {/* Right: hero photo or pattern fallback */}
        <div
          style={{
            width: 480,
            height: "100%",
            display: "flex",
            position: "relative",
            background: `linear-gradient(135deg, ${goldBright} 0%, ${gold} 55%, ${goldDim} 100%)`,
          }}
        >
          {heroUrl ? (
            <img
              src={heroUrl}
              alt=""
              width={480}
              height={630}
              style={{
                width: 480,
                height: 630,
                objectFit: "cover",
              }}
            />
          ) : (
            <div
              style={{
                position: "absolute",
                inset: 0,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: surface,
                fontSize: 140,
                fontWeight: 300,
                letterSpacing: -4,
                opacity: 0.35,
              }}
            >
              I
            </div>
          )}
        </div>
      </div>
    ),
    { ...size },
  );
}
