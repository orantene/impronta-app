// T2 + T4 + T5 — Talent Discover control panel.
//
// One cohesive standalone page covering three audit gaps that were
// individually "mega-file blocked" (they'd otherwise touch the 15k-LOC
// talent.tsx editor shell):
//
//   T2 — Discover card preview: how this talent appears on a client's
//        Discover card (photo / name / category / location / agency /
//        availability dots).
//   T4 — travel radius + remote-only status (talent_profiles columns).
//   T5 — 30-day Discover stats: favorites, shortlist appearances,
//        Discover-originated inquiries.
//
// Standalone server component. Registered in CANONICAL_ROUTE_MATCHERS
// so the talent SPA shell yields (same pattern as /talent/trust).
//
// Spec: project_discover_unified.md §9 (talent audit T2/T4/T5).

import Link from "next/link";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { getCachedActorSession } from "@/lib/server/request-cache";
import { resolveTalentPageScope } from "@/lib/talent/platform-talent-context";
import { logServerError } from "@/lib/server/safe-error";
import { SmartImage } from "@/components/ui/smart-image";
import { getRequestLocale } from "@/i18n/request-locale";
import { discoverCopy } from "./_discover-copy";

export const dynamic = "force-dynamic";
type PageParams = Promise<{ tenantSlug?: string }>;

function talentSubHref(tenantSlug: string, segment: string, platformRoutes: boolean): string {
  return platformRoutes ? `/talent/${segment}` : `/${tenantSlug}/talent/${segment}`;
}

const FONT = '"Inter", system-ui, sans-serif';
const C = {
  ink:        "#0B0B0D",
  inkMuted:   "rgba(11,11,13,0.55)",
  inkDim:     "rgba(11,11,13,0.35)",
  border:     "rgba(24,24,27,0.08)",
  borderSoft: "rgba(24,24,27,0.06)",
  cardBg:     "#ffffff",
  surface:    "rgba(11,11,13,0.02)",
  accent:     "#1D4ED8",
  accentSoft: "rgba(29,78,216,0.08)",
  success:    "#1A7348",
  successSoft: "rgba(26,115,72,0.10)",
  amber:      "#D69E2E",
  amberSoft:  "rgba(214,158,46,0.10)",
} as const;

type TalentDiscoverData = {
  displayName: string;
  profileCode: string | null;
  isDiscoverable: boolean;
  workflowStatus: string | null;
  homeCity: string | null;
  homeCountry: string | null;
  travelRadiusKm: number | null;
  remoteOnly: boolean;
  categoryLabel: string | null;
  agencyName: string | null;
  isExclusive: boolean;
  headshotUrl: string | null;
  // T5 stats (last 30 days)
  favoritesCount: number;
  shortlistAppearances: number;
  discoverInquiries: number;
};

async function loadTalentDiscover(
  userId: string,
  tenantId: string,
  locale: string,
): Promise<TalentDiscoverData | null> {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return null;

  const { data: tp, error: tpErr } = await supabase
    .from("talent_profiles")
    .select(
      `id, display_name, first_name, last_name, profile_code,
       is_discoverable, workflow_status,
       home_city_text, home_country_text,
       travel_radius_km, remote_only`,
    )
    .eq("user_id", userId)
    .maybeSingle();
  if (tpErr) logServerError("talent.discover.profile", tpErr);
  if (!tp) return null;

  const talentProfileId = tp.id as string;
  const admin = createServiceRoleClient();

  // Category (primary role) + agency (primary roster + plan tier).
  let categoryLabel: string | null = null;
  let agencyName: string | null = null;
  let isExclusive = false;
  let headshotUrl: string | null = null;
  let favoritesCount = 0;
  let shortlistAppearances = 0;
  let discoverInquiries = 0;

  if (admin) {
    const sinceIso = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

    const [catRes, rosterRes, photoRes, favRes, slRes, inqRes] = await Promise.all([
      admin
        .from("talent_profile_taxonomy")
        .select("relationship_type, taxonomy_terms(name_i18n, kind)")
        .eq("talent_profile_id", talentProfileId)
        .eq("relationship_type", "primary_role")
        .limit(1),
      admin
        .from("agency_talent_roster")
        .select("is_primary, status, agencies:tenant_id ( display_name, plan_tier )")
        .eq("talent_profile_id", talentProfileId)
        .in("status", ["active", "pending"])
        .order("is_primary", { ascending: false })
        .limit(1),
      admin
        .from("media_assets")
        .select("storage_path, variant_kind")
        .eq("owner_talent_profile_id", talentProfileId)
        .in("variant_kind", ["hero", "card", "public_watermarked", "watermarked", "gallery", "original"])
        .is("deleted_at", null)
        .limit(6),
      admin
        .from("client_favorites")
        .select("client_user_id", { count: "exact", head: true })
        .eq("talent_profile_id", talentProfileId),
      admin
        .from("client_shortlist_items")
        .select("shortlist_id", { count: "exact", head: true })
        .eq("talent_profile_id", talentProfileId),
      admin
        .from("inquiry_participants")
        .select("inquiry_id, inquiries!inquiry_id ( source_channel, created_at )")
        .eq("talent_profile_id", talentProfileId)
        .eq("role", "talent"),
    ]);

    const catRow = (catRes.data ?? [])[0] as
      | { taxonomy_terms: { name_i18n: Record<string, string | null> | null } | { name_i18n: Record<string, string | null> | null }[] | null }
      | undefined;
    const term = catRow ? (Array.isArray(catRow.taxonomy_terms) ? catRow.taxonomy_terms[0] : catRow.taxonomy_terms) : null;
    categoryLabel = (locale.toLowerCase().startsWith("es") ? term?.name_i18n?.es : null) ?? term?.name_i18n?.en ?? null;

    const rosterRow = (rosterRes.data ?? [])[0] as
      | { is_primary: boolean; agencies: { display_name: string | null; plan_tier: string | null } | { display_name: string | null; plan_tier: string | null }[] | null }
      | undefined;
    if (rosterRow) {
      const ag = Array.isArray(rosterRow.agencies) ? rosterRow.agencies[0] : rosterRow.agencies;
      agencyName = ag?.display_name ?? null;
      const tier = ag?.plan_tier ?? null;
      isExclusive = rosterRow.is_primary === true
        && (tier === "studio" || tier === "agency" || tier === "network" || tier === "hub-network");
    }

    const PRIORITY = ["hero", "card", "public_watermarked", "watermarked", "gallery", "original"];
    let bestRank = Infinity;
    for (const m of (photoRes.data ?? []) as Array<{ storage_path: string; variant_kind: string }>) {
      const rank = PRIORITY.indexOf(m.variant_kind);
      if (rank < 0 || rank >= bestRank) continue;
      bestRank = rank;
      headshotUrl =
        m.storage_path.startsWith("http") || m.storage_path.startsWith("/")
        ? m.storage_path
        : admin.storage.from("media-public").getPublicUrl(m.storage_path).data.publicUrl;
    }

    favoritesCount = favRes.count ?? 0;
    shortlistAppearances = slRes.count ?? 0;

    for (const r of (inqRes.data ?? []) as Array<{
      inquiries: { source_channel: string | null; created_at: string } | { source_channel: string | null; created_at: string }[] | null;
    }>) {
      const iq = Array.isArray(r.inquiries) ? r.inquiries[0] : r.inquiries;
      if (!iq) continue;
      const isDiscover = iq.source_channel === "discover_single_talent" || iq.source_channel === "discover_shortlist";
      if (isDiscover && iq.created_at >= sinceIso) discoverInquiries++;
    }
  }

  const displayName =
    ((tp.display_name as string | null) ?? "").trim()
    || `${(tp.first_name as string | null) ?? ""} ${(tp.last_name as string | null) ?? ""}`.trim()
    || discoverCopy(locale).unnamed;

  return {
    displayName,
    profileCode: (tp.profile_code as string | null) ?? null,
    isDiscoverable: tp.is_discoverable === true,
    workflowStatus: (tp.workflow_status as string | null) ?? null,
    homeCity: (tp.home_city_text as string | null) ?? null,
    homeCountry: (tp.home_country_text as string | null) ?? null,
    travelRadiusKm: (tp.travel_radius_km as number | null) ?? null,
    remoteOnly: tp.remote_only === true,
    categoryLabel,
    agencyName,
    isExclusive,
    headshotUrl,
    favoritesCount,
    shortlistAppearances,
    discoverInquiries,
  };
}

export default async function PlatformTalentDiscoverPage() {
  const { tenantSlug, tenantId } = await resolveTalentPageScope(Promise.resolve({}));
  const hdrs = await headers();
  const pathname = hdrs.get("x-impronta-original-pathname") ?? "";
  const platformRoutes =
    pathname.startsWith("/talent/") &&
    !/^\/[a-z0-9][a-z0-9-]{1,62}\/talent\//.test(pathname);
  const session = await getCachedActorSession();
  if (!session.user) notFound();

  const locale = await getRequestLocale();
  const c = discoverCopy(locale);
  const d = await loadTalentDiscover(session.user.id, tenantId, locale);
  if (!d) {
    return (
      <div style={{ fontFamily: FONT, padding: "32px 28px", maxWidth: 720 }}>
        <h1 style={{ margin: 0, fontSize: 24, color: C.ink, fontWeight: 600 }}>{c.discover}</h1>
        <div style={{ marginTop: 12, fontSize: 13.5, color: C.inkMuted, lineHeight: 1.55 }}>
          {c.noProfile}
        </div>
      </div>
    );
  }

  const liveOnDiscover =
    d.isDiscoverable && (d.workflowStatus === "approved" || d.workflowStatus === "published");
  const initials = d.displayName.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("");

  return (
    <div style={{ fontFamily: FONT, padding: "24px 28px", maxWidth: 980 }}>
      <div style={{ marginBottom: 18 }}>
        <Link href={talentSubHref(tenantSlug, "profile", platformRoutes)} style={{ fontSize: 11.5, color: C.inkMuted, textDecoration: "none" }}>
          {c.backToProfile}
        </Link>
      </div>

      <div style={{ marginBottom: 22 }}>
        <h1 style={{ margin: 0, fontSize: 26, fontWeight: 600, color: C.ink, letterSpacing: -0.3 }}>
          {c.presenceTitle}
        </h1>
        <div style={{ fontSize: 13, color: C.inkMuted, marginTop: 6, lineHeight: 1.5, maxWidth: 620 }}>
          {c.presenceLede}
        </div>
      </div>

      {/* Enrollment status banner */}
      <div style={{
        display: "flex", alignItems: "center", gap: 10,
        padding: "12px 16px", marginBottom: 22,
        background: liveOnDiscover ? C.successSoft : C.amberSoft,
        border: `1px solid ${liveOnDiscover ? `${C.success}33` : `${C.amber}33`}`,
        borderRadius: 10, fontSize: 13,
      }}>
        <span style={{ fontSize: 16 }} aria-hidden>{liveOnDiscover ? "✓" : "○"}</span>
        <span style={{ color: C.ink, fontWeight: 600 }}>
          {liveOnDiscover
            ? c.liveOnDiscover
            : d.isDiscoverable
              ? c.pendingApproval
              : c.notOnDiscover}
        </span>
        {!d.isDiscoverable && (
          <span style={{ color: C.inkMuted, fontWeight: 500 }}>
            · {c.enableHint}
          </span>
        )}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "300px 1fr", gap: 20, alignItems: "start" }}>
        {/* T2 — card preview */}
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: C.inkMuted, letterSpacing: 0.4, textTransform: "uppercase", marginBottom: 10 }}>
            {c.cardPreview}
          </div>
          <div style={{
            background: C.cardBg, border: `1px solid ${C.border}`,
            borderRadius: 14, overflow: "hidden",
          }}>
            <div style={{
              aspectRatio: "4 / 5", background: C.surface,
              display: "flex", alignItems: "center", justifyContent: "center",
              position: "relative", overflow: "hidden",
            }}>
              {d.headshotUrl ? (
                <SmartImage
                  src={d.headshotUrl}
                  alt={d.displayName}
                  fill
                  sizes="(max-width: 768px) 50vw, 320px"
                  style={{ objectFit: "cover" }}
                />
              ) : (
                <div style={{
                  width: 64, height: 64, borderRadius: "50%",
                  background: C.accentSoft, color: C.accent,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 22, fontWeight: 700,
                }}>
                  {initials || "?"}
                </div>
              )}
            </div>
            <div style={{ padding: "12px 14px" }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: C.ink }}>{d.displayName}</div>
              {d.categoryLabel && (
                <div style={{ fontSize: 11.5, color: C.inkMuted, marginTop: 2 }}>{d.categoryLabel}</div>
              )}
              {(d.homeCity || d.homeCountry) && (
                <div style={{ fontSize: 11, color: C.inkDim, marginTop: 2 }}>
                  {[d.homeCity, d.homeCountry].filter(Boolean).join(" · ")}
                </div>
              )}
              {d.agencyName && (
                <div style={{ fontSize: 10.5, color: C.inkDim, marginTop: 4 }}>
                  🏛 {d.agencyName}{d.isExclusive ? ` · ${c.exclusive}` : ""}
                </div>
              )}
            </div>
          </div>
          <div style={{ fontSize: 11, color: C.inkDim, marginTop: 8, lineHeight: 1.5 }}>
            {c.cardPreviewHint}
          </div>
        </div>

        {/* Right column — T4 + T5 */}
        <div className="flex flex-col gap-4">
          {/* T5 — 30-day stats */}
          <div style={{
            background: C.cardBg, border: `1px solid ${C.border}`,
            borderRadius: 12, padding: "16px 20px",
          }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: C.inkMuted, letterSpacing: 0.4, textTransform: "uppercase", marginBottom: 14 }}>
              {c.last30Days}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16 }}>
              <Stat label={c.favoritedBy} value={d.favoritesCount} hint={c.clients} />
              <Stat label={c.onShortlists} value={d.shortlistAppearances} hint={c.appearances} />
              <Stat label={c.discoverInquiries} value={d.discoverInquiries} hint={c.received} />
            </div>
            <div style={{ fontSize: 11, color: C.inkDim, marginTop: 14, lineHeight: 1.5 }}>
              {c.statsNote}
            </div>
          </div>

          {/* T4 — travel reach */}
          <div style={{
            background: C.cardBg, border: `1px solid ${C.border}`,
            borderRadius: 12, padding: "16px 20px",
          }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: C.inkMuted, letterSpacing: 0.4, textTransform: "uppercase", marginBottom: 12 }}>
              {c.travelReach}
            </div>
            <KvRow
              label={c.homeBase}
              value={[d.homeCity, d.homeCountry].filter(Boolean).join(", ") || c.notSet}
            />
            <KvRow
              label={c.travelRadius}
              value={
                d.remoteOnly
                  ? c.remoteNoTravel
                  : d.travelRadiusKm != null
                    ? c.kmFromHome(d.travelRadiusKm)
                    : c.radiusNotSet
              }
            />
            <KvRow
              label={c.remoteWork}
              value={d.remoteOnly ? c.remoteOnly : c.openInPersonRemote}
            />
            <div style={{ fontSize: 11, color: C.inkDim, marginTop: 10, lineHeight: 1.5 }}>
              {c.travelHint}
            </div>
          </div>
        </div>
      </div>

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 22 }}>
        <Link href={talentSubHref(tenantSlug, "profile", platformRoutes)} style={{
          display: "inline-flex", alignItems: "center", gap: 6,
          padding: "9px 14px", background: C.accent, color: "#fff",
          borderRadius: 8, fontSize: 12.5, fontWeight: 600, textDecoration: "none",
        }}>
          {c.editProfile}
        </Link>
        {d.profileCode && (
          <a
            href={`https://tulala.digital/t/${d.profileCode}`}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: "inline-flex", alignItems: "center", gap: 6,
              padding: "9px 14px", background: "transparent",
              color: C.ink, border: `1px solid ${C.border}`,
              borderRadius: 8, fontSize: 12.5, fontWeight: 600, textDecoration: "none",
            }}
          >
            {c.viewPublicPage}
          </a>
        )}
        <Link href={talentSubHref(tenantSlug, "trust", platformRoutes)} style={{
          display: "inline-flex", alignItems: "center", gap: 6,
          padding: "9px 14px", background: "transparent",
          color: C.ink, border: `1px solid ${C.border}`,
          borderRadius: 8, fontSize: 12.5, fontWeight: 600, textDecoration: "none",
        }}>
          {c.trustSignals}
        </Link>
      </div>
    </div>
  );
}

function Stat({ label, value, hint }: { label: string; value: number; hint: string }) {
  return (
    <div>
      <div style={{ fontSize: 24, fontWeight: 700, color: C.ink }}>{value}</div>
      <div style={{ fontSize: 11.5, color: C.inkMuted, fontWeight: 600, marginTop: 2 }}>{label}</div>
      <div style={{ fontSize: 10.5, color: C.inkDim }}>{hint}</div>
    </div>
  );
}

function KvRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{
      display: "grid", gridTemplateColumns: "140px 1fr", gap: 14,
      padding: "8px 0", borderBottom: `1px solid ${C.borderSoft}`,
      fontSize: 13,
    }}>
      <div style={{ color: C.inkMuted, fontWeight: 500 }}>{label}</div>
      <div style={{ color: C.ink }}>{value}</div>
    </div>
  );
}
