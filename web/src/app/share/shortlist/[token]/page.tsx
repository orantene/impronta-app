// D10 — Public shortlist landing.
//
// Renders a read-only view of a client's shortlist for anyone holding a
// valid token. No auth required. Talents deep-link to their public
// profile (/t/<profileCode>) for further action — there's no inline
// inquiry CTA here; the recipient inquires the normal way.
//
// Token revocation = TTL only (see lib/discover/shortlist-share-token.ts).

import Link from "next/link";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError } from "@/lib/server/safe-error";
import { verifyShortlistToken } from "@/lib/discover/shortlist-share-token";
import { getRequestLocale } from "@/i18n/request-locale";
import { createTranslator } from "@/i18n/messages";

export const dynamic = "force-dynamic";
type PageParams = Promise<{ token: string }>;

const FONT = '"Inter", system-ui, sans-serif';
const FONT_DISPLAY =
  'var(--font-geist-sans), "Inter", -apple-system, system-ui, sans-serif';

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
} as const;

const PHOTO_VARIANT_PRIORITY = [
  "hero",
  "card",
  "public_watermarked",
  "watermarked",
  "gallery",
  "original",
];

type PublicTalent = {
  id: string;
  displayName: string;
  profileCode: string | null;
  primaryTypeLabel: string | null;
  homeCity: string | null;
  homeCountry: string | null;
  agencyName: string | null;
  isExclusive: boolean;
  headshotUrl: string | null;
};

type PublicShortlist = {
  id: string;
  name: string;
  eventDateHint: string | null;
  notes: string | null;
  updatedAt: string;
  ownerDisplayName: string | null;
  talents: PublicTalent[];
};

async function loadPublicShortlist(
  shortlistId: string,
  issuerUserId: string,
): Promise<PublicShortlist | null> {
  const admin = createServiceRoleClient();
  if (!admin) return null;

  // Re-fetch the shortlist with ownership match — defense in depth.
  // If the issuer is no longer the owner (account merged / shortlist
  // transferred / etc.), the public link goes dead.
  const { data: shortlistRow, error: slErr } = await admin
    .from("client_shortlists")
    .select(
      `
      id, name, event_date_hint, notes, updated_at, client_user_id,
      client_shortlist_items!shortlist_id (
        talent_profile_id,
        talent_profiles!talent_profile_id (
          id, display_name, first_name, last_name, profile_code,
          home_country_text, home_city_text,
          workflow_status, is_discoverable,
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
    .eq("id", shortlistId)
    .maybeSingle();

  if (slErr) {
    logServerError("share.shortlist.loadShortlist", slErr);
    return null;
  }
  if (!shortlistRow) return null;
  type SlRow = {
    id: string;
    name: string;
    event_date_hint: string | null;
    notes: string | null;
    updated_at: string;
    client_user_id: string;
    client_shortlist_items: Array<{
      talent_profile_id: string;
      talent_profiles: {
        id: string;
        display_name: string | null;
        first_name: string | null;
        last_name: string | null;
        profile_code: string | null;
        home_country_text: string | null;
        home_city_text: string | null;
        workflow_status: string | null;
        is_discoverable: boolean | null;
        talent_profile_taxonomy: Array<{
          relationship_type: string | null;
          taxonomy_terms: { name_en: string | null } | null;
        }> | null;
        agency_talent_roster: Array<{
          tenant_id: string;
          status: string;
          is_primary: boolean;
          agencies:
            | { display_name: string | null }
            | { display_name: string | null }[]
            | null;
        }> | null;
      } | null;
    }> | null;
  };
  const sl = shortlistRow as unknown as SlRow;
  if (sl.client_user_id !== issuerUserId) return null;

  // Best-effort: get the owner's display name for the header byline.
  const { data: ownerProfile } = await admin
    .from("profiles")
    .select("display_name")
    .eq("id", issuerUserId)
    .maybeSingle();
  const ownerDisplayName =
    (ownerProfile as { display_name?: string | null } | null)?.display_name?.trim() || null;

  const items = sl.client_shortlist_items ?? [];
  const talentIds = items
    .map((it) => it.talent_profile_id)
    .filter((v): v is string => typeof v === "string");

  const photoByTalent = new Map<string, string>();
  if (talentIds.length > 0) {
    const { data: photos } = await admin
      .from("media_assets")
      .select("owner_talent_profile_id, storage_path, variant_kind")
      .in("owner_talent_profile_id", talentIds)
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

  const talents: PublicTalent[] = items
    .map((it): PublicTalent | null => {
      const t = it.talent_profiles;
      if (!t) return null;
      // Hide non-public talents from the shared view — if the owner
      // hid them after creating the shortlist, the recipient shouldn't
      // see them either.
      if (!t.is_discoverable) return null;
      if (t.workflow_status !== "approved" && t.workflow_status !== "published") {
        return null;
      }
      const displayName =
        (t.display_name ?? "").trim() ||
        `${t.first_name ?? ""} ${t.last_name ?? ""}`.trim() ||
        "Unnamed";
      const tax = t.talent_profile_taxonomy ?? [];
      const primary = tax.find((tt) => tt.relationship_type === "primary_role");
      const roster = t.agency_talent_roster ?? [];
      const active = roster.filter(
        (r) => r.status === "active" || r.status === "pending",
      );
      const primaryRoster = active.find((r) => r.is_primary) ?? null;
      const agencyRowOrArr = primaryRoster?.agencies;
      const agencyRow = Array.isArray(agencyRowOrArr)
        ? agencyRowOrArr[0]
        : agencyRowOrArr;
      return {
        id: t.id,
        displayName,
        profileCode: t.profile_code,
        primaryTypeLabel: primary?.taxonomy_terms?.name_en ?? null,
        homeCity: t.home_city_text,
        homeCountry: t.home_country_text,
        agencyName: agencyRow?.display_name ?? null,
        isExclusive: !!primaryRoster?.is_primary,
        headshotUrl: photoByTalent.get(t.id) ?? null,
      };
    })
    .filter((v): v is PublicTalent => v !== null);

  return {
    id: sl.id,
    name: sl.name,
    eventDateHint: sl.event_date_hint,
    notes: sl.notes,
    updatedAt: sl.updated_at,
    ownerDisplayName,
    talents,
  };
}

export default async function PublicShortlistPage({ params }: { params: PageParams }) {
  const { token } = await params;
  const locale = await getRequestLocale();
  const t = createTranslator(locale);

  const verified = verifyShortlistToken(decodeURIComponent(token));
  if (!verified.ok) {
    return (
      <ShareError
        title={
          verified.reason === "expired"
            ? t("public.share.shortlist.expiredTitle")
            : t("public.share.shortlist.invalidTitle")
        }
        body={
          verified.reason === "expired"
            ? t("public.share.shortlist.expiredBody")
            : t("public.share.shortlist.invalidBody")
        }
      />
    );
  }

  const shortlist = await loadPublicShortlist(
    verified.claims.shortlistId,
    verified.claims.issuerUserId,
  );
  if (!shortlist) {
    return (
      <ShareError
        title={t("public.share.shortlist.notAvailableTitle")}
        body={t("public.share.shortlist.notAvailableBody")}
      />
    );
  }

  return (
    <div style={{
      minHeight: "100vh",
      background: "#fafafa",
      fontFamily: FONT,
      color: C.ink,
    }}>
      <div style={{ maxWidth: 980, margin: "0 auto", padding: "48px 24px 64px" }}>
        <div style={{ marginBottom: 28 }}>
          <div style={{
            fontSize: 10.5, fontWeight: 700, letterSpacing: 0.5,
            textTransform: "uppercase", color: C.inkMuted, marginBottom: 6,
          }}>
            Tulala · Shared shortlist
          </div>
          <h1 style={{
            fontFamily: FONT_DISPLAY,
            fontSize: 32, fontWeight: 600, letterSpacing: -0.5,
            margin: 0, marginBottom: 8, color: C.ink,
          }}>
            {shortlist.name}
          </h1>
          {(shortlist.ownerDisplayName || shortlist.eventDateHint) && (
            <p style={{ fontSize: 14, color: C.inkMuted, margin: 0, lineHeight: 1.5 }}>
              {shortlist.ownerDisplayName && <>Shared by <strong style={{ color: C.ink }}>{shortlist.ownerDisplayName}</strong></>}
              {shortlist.ownerDisplayName && shortlist.eventDateHint && " · "}
              {shortlist.eventDateHint && <>Event: {shortlist.eventDateHint}</>}
            </p>
          )}
          {shortlist.notes && (
            <p style={{
              marginTop: 16,
              fontSize: 13.5, color: C.inkMuted,
              lineHeight: 1.55,
              padding: "12px 14px",
              background: C.cardBg,
              border: `1px solid ${C.border}`,
              borderRadius: 12,
              fontStyle: "italic",
            }}>
              “{shortlist.notes}”
            </p>
          )}
        </div>

        {shortlist.talents.length === 0 ? (
          <div style={{
            padding: 32, textAlign: "center",
            background: C.cardBg,
            border: `1px solid ${C.border}`,
            borderRadius: 14,
            color: C.inkMuted, fontSize: 13.5, lineHeight: 1.55,
          }}>
            <div style={{ fontSize: 15, fontWeight: 600, color: C.ink, marginBottom: 4 }}>
              This shortlist is empty
            </div>
            <p style={{ margin: 0 }}>
              The owner hasn&apos;t added any visible talent yet, or some were
              removed after this link was generated.
            </p>
          </div>
        ) : (
          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
            gap: 16,
          }}>
            {shortlist.talents.map((t) => (
              <TalentCard key={t.id} talent={t} />
            ))}
          </div>
        )}

        <footer style={{
          marginTop: 48,
          paddingTop: 20,
          borderTop: `1px solid ${C.borderSoft}`,
          fontSize: 11.5,
          color: C.inkDim,
          textAlign: "center",
          lineHeight: 1.5,
        }}>
          Powered by Tulala · This link expires automatically.
        </footer>
      </div>
    </div>
  );
}

function TalentCard({ talent }: { talent: PublicTalent }) {
  const subtitle = [
    talent.primaryTypeLabel,
    talent.agencyName ?? (talent.isExclusive ? null : "Independent"),
    [talent.homeCity, talent.homeCountry].filter(Boolean).join(", ") || null,
  ]
    .filter(Boolean)
    .join(" · ");

  const cardInner = (
    <div style={{
      background: C.cardBg,
      border: `1px solid ${C.border}`,
      borderRadius: 14,
      overflow: "hidden",
      display: "flex",
      flexDirection: "column",
      height: "100%",
    }}>
      <div style={{
        aspectRatio: "4 / 5",
        background: talent.headshotUrl
          ? `url(${talent.headshotUrl}) center/cover no-repeat`
          : C.accentSoft,
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 32, fontWeight: 700, color: C.accent,
      }}>
        {!talent.headshotUrl && talent.displayName.split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("")}
      </div>
      <div style={{ padding: 12, display: "flex", flexDirection: "column", gap: 4, flex: 1 }}>
        <div style={{
          fontSize: 14, fontWeight: 700, color: C.ink, letterSpacing: -0.1,
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        }}>
          {talent.displayName}
        </div>
        {subtitle && (
          <div style={{ fontSize: 11.5, color: C.inkMuted, lineHeight: 1.4 }}>
            {subtitle}
          </div>
        )}
      </div>
    </div>
  );

  if (talent.profileCode) {
    return (
      <Link
        href={`/t/${talent.profileCode}`}
        target="_blank"
        rel="noopener"
        style={{ textDecoration: "none", color: "inherit" }}
      >
        {cardInner}
      </Link>
    );
  }
  return cardInner;
}

function ShareError({ title, body }: { title: string; body: string }) {
  return (
    <div style={{
      minHeight: "100vh",
      background: "#fafafa",
      fontFamily: FONT,
      color: C.ink,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
    }}>
      <div style={{
        maxWidth: 420,
        padding: 32,
        background: C.cardBg,
        border: `1px solid ${C.border}`,
        borderRadius: 14,
        textAlign: "center",
      }}>
        <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 8, color: C.ink }}>
          {title}
        </div>
        <p style={{ fontSize: 13.5, color: C.inkMuted, margin: 0, lineHeight: 1.55 }}>
          {body}
        </p>
      </div>
    </div>
  );
}

