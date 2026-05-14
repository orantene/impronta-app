/**
 * Public talent share-card landing page.
 *
 * Resolves the `[slug]` to a real `talent_profiles.profile_code` and renders
 * a public profile card with gallery, agency representation, and an inquiry
 * CTA that deeplinks back to the agency's workspace pre-filled with this talent.
 *
 * Previously rendered hardcoded MOCK_TALENT — fully wired to DB (B.4, 2026-05-13).
 */

import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { createPublicSupabaseClient } from "@/lib/supabase/public";

interface PageProps {
  params: Promise<{ slug: string }>;
}

export const dynamic = "force-dynamic";

const MEDIA_BUCKET = "media-public";

type ProfileRow = {
  id: string;
  profile_code: string;
  display_name: string | null;
  first_name: string | null;
  last_name: string | null;
  short_bio: string | null;
  height_cm: number | null;
  workflow_status: string | null;
  visibility: string | null;
};

type MediaRow = {
  storage_path: string;
  variant_kind: string | null;
  sort_order: number | null;
  deleted_at: string | null;
  approval_state: string | null;
};

type RosterRow = {
  status: string;
  tenant_id: string;
  agency_visibility: string | null;
  agencies: { display_name: string | null; slug: string } | { display_name: string | null; slug: string }[] | null;
};

type LoadedTalent = {
  profile: ProfileRow;
  avatarUrl: string | null;
  heroUrl: string | null;
  galleryUrls: string[];
  agencyName: string;
  agencySlug: string;
  cityLabel: string | null;
};

function unwrapAgency(value: RosterRow["agencies"]): { display_name: string | null; slug: string } | null {
  if (!value) return null;
  return Array.isArray(value) ? value[0] ?? null : value;
}

function inchesFromCm(cm: number): string {
  const inches = cm / 2.54;
  const ft = Math.floor(inches / 12);
  const remaining = Math.round(inches - ft * 12);
  return `${ft}'${remaining}" · ${cm}cm`;
}

async function loadTalent(slug: string): Promise<LoadedTalent | null> {
  const supabase = createPublicSupabaseClient();
  if (!supabase) return null;

  // `profile_code` is stored uppercase in the DB (canonical `TAL-NNNNN`). The
  // public URL is case-insensitive for friendliness — anyone sharing or hand-
  // typing the link gets the same result. Normalize to uppercase before the
  // exact-match query so the `(profile_code)` btree index is still used.
  const normalized = slug.trim().toUpperCase();
  if (!normalized) return null;

  const { data: profile, error: profileErr } = await supabase
    .from("talent_profiles")
    .select(
      "id, profile_code, display_name, first_name, last_name, short_bio, height_cm, workflow_status, visibility, location_id",
    )
    .eq("profile_code", normalized)
    .in("workflow_status", ["published", "approved"])
    .eq("visibility", "public")
    .maybeSingle();

  if (profileErr || !profile) return null;

  const typedProfile = profile as ProfileRow & { location_id: string | null };

  // Load agency representation via the roster.
  const { data: rosterRows } = await supabase
    .from("agency_talent_roster")
    .select(
      "status, tenant_id, agency_visibility, agencies!tenant_id ( display_name, slug )",
    )
    .eq("talent_profile_id", typedProfile.id)
    .eq("status", "active")
    .in("agency_visibility", ["site_visible", "featured"])
    .limit(1);

  const roster = (rosterRows ?? [])[0] as RosterRow | undefined;
  const agency = unwrapAgency(roster?.agencies ?? null);
  const agencyName = agency?.display_name ?? "Tulala roster";
  const agencySlug = agency?.slug ?? "";

  // Load gallery media.
  const { data: mediaRows } = await supabase
    .from("media_assets")
    .select("storage_path, variant_kind, sort_order, deleted_at, approval_state")
    .eq("owner_talent_profile_id", typedProfile.id)
    .is("deleted_at", null)
    .order("sort_order", { ascending: true })
    .limit(50);

  const visible = ((mediaRows ?? []) as MediaRow[]).filter(
    (m) => m.approval_state === null || m.approval_state === "approved",
  );

  const toUrl = (path: string) => supabase.storage.from(MEDIA_BUCKET).getPublicUrl(path).data.publicUrl;

  const avatar = visible.find((m) => m.variant_kind === "avatar");
  const hero = visible.find((m) => m.variant_kind === "hero");
  const gallery = visible
    .filter((m) => m.variant_kind === "gallery" || m.variant_kind === "card" || m.variant_kind === "polaroid")
    .slice(0, 8)
    .map((m) => toUrl(m.storage_path));

  // Load residence city label.
  let cityLabel: string | null = null;
  if (typedProfile.location_id) {
    const { data: loc } = await supabase
      .from("locations")
      .select("display_name_en")
      .eq("id", typedProfile.location_id)
      .maybeSingle();
    cityLabel = (loc as { display_name_en?: string } | null)?.display_name_en ?? null;
  }

  return {
    profile: typedProfile,
    avatarUrl: avatar ? toUrl(avatar.storage_path) : null,
    heroUrl: hero ? toUrl(hero.storage_path) : (avatar ? toUrl(avatar.storage_path) : null),
    galleryUrls: gallery,
    agencyName,
    agencySlug,
    cityLabel,
  };
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const talent = await loadTalent(slug);

  if (!talent) {
    return {
      title: "Profile not found · Tulala",
      description: "This talent profile is no longer available.",
    };
  }

  const name =
    talent.profile.display_name ??
    [talent.profile.first_name, talent.profile.last_name].filter(Boolean).join(" ") ??
    "Talent";
  const description = talent.profile.short_bio ?? `${name} — represented by ${talent.agencyName}.`;

  return {
    title: `${name} · ${talent.agencyName}`,
    description,
    openGraph: {
      title: `${name} — talent profile`,
      description,
      type: "profile",
      images: talent.heroUrl ? [{ url: talent.heroUrl }] : undefined,
    },
    twitter: {
      card: "summary_large_image",
      title: `${name} — talent profile`,
      description,
      images: talent.heroUrl ? [talent.heroUrl] : undefined,
    },
  };
}

export default async function TalentSharePage({ params }: PageProps) {
  const { slug } = await params;
  const talent = await loadTalent(slug);

  if (!talent) notFound();

  const name =
    talent.profile.display_name ??
    [talent.profile.first_name, talent.profile.last_name].filter(Boolean).join(" ") ??
    "Talent";
  const firstName = (talent.profile.first_name ?? name.split(" ")[0] ?? name).trim();
  const heightLabel = talent.profile.height_cm ? inchesFromCm(talent.profile.height_cm) : "—";
  const inquiryHref = talent.agencySlug
    ? `/${talent.agencySlug}/client/inquiries/new?talent=${encodeURIComponent(talent.profile.profile_code)}&utm_source=share`
    : `/?inquiry=${encodeURIComponent(talent.profile.profile_code)}&utm_source=share`;

  return (
    <div
      style={{
        minHeight: "100dvh",
        background: "#FAFAF7",
        fontFamily: "var(--font-geist-sans), system-ui, sans-serif",
        color: "#0B0B0D",
        padding: "24px 16px 48px",
      }}
    >
      <main
        style={{
          maxWidth: 720,
          margin: "0 auto",
          background: "#fff",
          border: "1px solid rgba(24,24,27,0.06)",
          borderRadius: 16,
          overflow: "hidden",
          boxShadow: "0 12px 36px rgba(11,11,13,0.08)",
        }}
      >
        {/* Cover */}
        <div
          style={{
            position: "relative",
            background: "linear-gradient(135deg, #F2F2EE 0%, #E5E1D7 100%)",
            height: 280,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 80,
            color: "#0F4F3E",
            overflow: "hidden",
          }}
        >
          {talent.heroUrl && (
            <Image
              src={talent.heroUrl}
              alt={talent.profile.display_name ?? "Talent"}
              fill
              sizes="(max-width: 700px) 100vw, 640px"
              priority
              style={{ objectFit: "cover" }}
            />
          )}
          {!talent.heroUrl ? "✨" : null}
        </div>

        {/* Identity */}
        <div style={{ padding: "24px 28px 28px" }}>
          <div
            style={{
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: 1,
              textTransform: "uppercase",
              color: "rgba(11,11,13,0.55)",
            }}
          >
            Represented by {talent.agencyName}
          </div>
          <h1
            style={{
              fontFamily: "var(--font-geist-sans), system-ui, sans-serif",
              fontSize: 36,
              fontWeight: 600,
              letterSpacing: -0.6,
              margin: "6px 0 0",
              lineHeight: 1.1,
            }}
          >
            {name}
          </h1>
          {talent.profile.short_bio ? (
            <div
              style={{
                fontSize: 15,
                color: "rgba(11,11,13,0.62)",
                marginTop: 6,
                lineHeight: 1.55,
              }}
            >
              {talent.profile.short_bio}
            </div>
          ) : null}

          {/* Stats grid */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(3, 1fr)",
              gap: 12,
              marginTop: 24,
              padding: "16px 0",
              borderTop: "1px solid rgba(24,24,27,0.06)",
              borderBottom: "1px solid rgba(24,24,27,0.06)",
            }}
          >
            <Stat label="Based in" value={talent.cityLabel ?? "—"} />
            <Stat label="Height" value={heightLabel} />
            <Stat label="Agency" value={talent.agencyName} />
          </div>

          {/* Gallery */}
          {talent.galleryUrls.length > 0 ? (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(4, 1fr)",
                gap: 6,
                marginTop: 20,
              }}
            >
              {talent.galleryUrls.slice(0, 8).map((url, i) => (
                <div
                  key={url + i}
                  style={{
                    position: "relative",
                    aspectRatio: "3 / 4",
                    background: "#F2F2EE",
                    borderRadius: 8,
                    overflow: "hidden",
                  }}
                >
                  <Image
                    src={url}
                    alt={`${talent.profile.display_name ?? "Talent"} portfolio ${i + 1}`}
                    fill
                    sizes="(max-width: 700px) 25vw, 160px"
                    style={{ objectFit: "cover" }}
                  />
                </div>
              ))}
            </div>
          ) : (
            <div
              style={{
                marginTop: 20,
                padding: "20px 0",
                fontSize: 13,
                color: "rgba(11,11,13,0.45)",
                textAlign: "center",
              }}
            >
              Portfolio uploading soon.
            </div>
          )}

          {/* CTA */}
          <div
            style={{
              marginTop: 28,
              padding: 20,
              background: "rgba(15,79,62,0.06)",
              borderRadius: 12,
            }}
          >
            <div style={{ fontSize: 15, fontWeight: 600, color: "#093328" }}>
              Want to book {firstName}?
            </div>
            <div
              style={{
                fontSize: 13,
                color: "rgba(9,51,40,0.78)",
                marginTop: 6,
                lineHeight: 1.55,
              }}
            >
              Tell {talent.agencyName} about your project — dates, brief, and budget.
            </div>
            <div style={{ marginTop: 14, display: "flex", gap: 10, flexWrap: "wrap" }}>
              <Link
                href={inquiryHref}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "10px 18px",
                  background: "#0F4F3E",
                  color: "#fff",
                  borderRadius: 9,
                  fontFamily: "var(--font-geist-sans), system-ui, sans-serif",
                  fontSize: 14,
                  fontWeight: 500,
                  textDecoration: "none",
                }}
              >
                Send inquiry →
              </Link>
              {talent.agencySlug ? (
                <Link
                  href={`/${talent.agencySlug}`}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    padding: "10px 18px",
                    background: "transparent",
                    color: "#093328",
                    border: "1px solid rgba(9,51,40,0.22)",
                    borderRadius: 9,
                    fontFamily: "var(--font-geist-sans), system-ui, sans-serif",
                    fontSize: 14,
                    fontWeight: 500,
                    textDecoration: "none",
                  }}
                >
                  See more talent
                </Link>
              ) : null}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div
          style={{
            padding: "14px 28px",
            borderTop: "1px solid rgba(24,24,27,0.06)",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            fontSize: 11.5,
            color: "rgba(11,11,13,0.55)",
          }}
        >
          <span>Powered by Tulala</span>
          <Link href="/" style={{ color: "rgba(11,11,13,0.55)", textDecoration: "none" }}>
            How it works →
          </Link>
        </div>
      </main>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div
        style={{
          fontSize: 10.5,
          fontWeight: 600,
          letterSpacing: 0.6,
          textTransform: "uppercase",
          color: "rgba(11,11,13,0.55)",
        }}
      >
        {label}
      </div>
      <div style={{ fontSize: 13, color: "#0B0B0D", marginTop: 2, fontWeight: 500 }}>
        {value}
      </div>
    </div>
  );
}
