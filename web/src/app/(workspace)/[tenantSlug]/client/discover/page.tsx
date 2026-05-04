// Phase 3.10 — Client Discover page.
// Browse the agency's active roster. Client context: every profile links to
// an inquiry pre-filled with that talent.

import { notFound } from "next/navigation";
import Link from "next/link";
import { getTenantScopeBySlug } from "@/lib/saas/scope";
import { getCachedActorSession } from "@/lib/server/request-cache";
import { loadClientSelfProfile, loadWorkspaceRosterEnriched } from "../../_data-bridge";

export const dynamic = "force-dynamic";
type PageParams = Promise<{ tenantSlug: string }>;

const C = {
  ink:        "#0B0B0D",
  inkMuted:   "rgba(11,11,13,0.55)",
  inkDim:     "rgba(11,11,13,0.35)",
  borderSoft: "rgba(24,24,27,0.08)",
  cardBg:     "#ffffff",
  surface:    "rgba(11,11,13,0.02)",
  accent:     "#1D4ED8",
  accentSoft: "rgba(29,78,216,0.08)",
  blue:       "#2563EB",
  blueDeep:   "#1D4ED8",
  greenDeep:  "#1A7348",
  greenSoft:  "rgba(26,115,72,0.10)",
} as const;

const FONT = '"Inter", system-ui, sans-serif';
const FONT_DISPLAY = 'var(--font-geist-sans), "Inter", -apple-system, system-ui, sans-serif';

function ProfileCard({
  id,
  name,
  primaryTypeLabel,
  city,
  state,
  tenantSlug,
}: {
  id: string;
  name: string;
  primaryTypeLabel?: string;
  city?: string;
  state: string;
  tenantSlug: string;
}) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");

  const isPublished = state === "published";

  return (
    <div
      style={{
        background: C.cardBg,
        border: `1px solid ${C.borderSoft}`,
        borderRadius: 14,
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        fontFamily: FONT,
      }}
    >
      {/* Avatar area */}
      <div
        style={{
          height: 120,
          background: "rgba(11,11,13,0.03)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <div
          style={{
            width: 56,
            height: 56,
            borderRadius: "50%",
            background: C.accentSoft,
            color: C.accent,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 18,
            fontWeight: 700,
            letterSpacing: 0.5,
          }}
        >
          {initials}
        </div>
      </div>

      {/* Info */}
      <div style={{ padding: "12px 14px 14px", flex: 1, display: "flex", flexDirection: "column", gap: 4 }}>
        <div style={{ fontFamily: FONT_DISPLAY, fontSize: 14, fontWeight: 600, color: C.ink, letterSpacing: -0.1 }}>
          {name}
        </div>
        {primaryTypeLabel && (
          <div style={{ fontSize: 11.5, color: C.inkMuted }}>{primaryTypeLabel}</div>
        )}
        {city && (
          <div style={{ fontSize: 11, color: C.inkDim, marginTop: 2 }}>{city}</div>
        )}

        <div style={{ flex: 1 }} />

        {isPublished ? (
          <Link
            href={`/${tenantSlug}/client/inquiries`}
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              marginTop: 10,
              height: 32,
              borderRadius: 8,
              background: C.accent,
              color: "#fff",
              fontSize: 12,
              fontWeight: 600,
              textDecoration: "none",
              fontFamily: FONT,
            }}
          >
            Request booking
          </Link>
        ) : (
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              marginTop: 10,
              height: 32,
              borderRadius: 8,
              background: C.surface,
              color: C.inkDim,
              fontSize: 12,
              fontWeight: 500,
              fontFamily: FONT,
            }}
          >
            Not available
          </div>
        )}
      </div>
    </div>
  );
}

export default async function ClientDiscoverPage({ params }: { params: PageParams }) {
  const { tenantSlug } = await params;
  const session = await getCachedActorSession();
  if (!session.user) notFound();

  const scope = await getTenantScopeBySlug(tenantSlug);
  if (!scope) notFound();

  const clientProfile = await loadClientSelfProfile(session.user.id, scope.tenantId);
  if (!clientProfile) notFound();

  // Show only published + active talent
  const roster = await loadWorkspaceRosterEnriched(scope.tenantId);
  const visible = roster.filter((r) => r.state === "published");

  return (
    <div style={{ fontFamily: FONT }}>

      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <h1
          style={{
            fontFamily: FONT_DISPLAY,
            fontSize: 24,
            fontWeight: 600,
            color: C.ink,
            margin: 0,
            letterSpacing: -0.4,
          }}
        >
          Discover talent
        </h1>
        <p style={{ fontSize: 13, color: C.inkMuted, margin: "6px 0 0", lineHeight: 1.5 }}>
          Browse {clientProfile.agencyName}&apos;s roster.
          {visible.length > 0 && ` ${visible.length} talent available for bookings.`}
        </p>
      </div>

      {visible.length > 0 ? (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
            gap: 16,
          }}
        >
          {visible.map((t) => (
            <ProfileCard
              key={t.id}
              id={t.id}
              name={t.name}
              primaryTypeLabel={t.primaryTypeLabel}
              city={t.city}
              state={t.state}
              tenantSlug={tenantSlug}
            />
          ))}
        </div>
      ) : (
        <div
          style={{
            padding: "60px 20px",
            textAlign: "center",
            background: C.surface,
            border: `1px dashed ${C.borderSoft}`,
            borderRadius: 14,
          }}
        >
          <div style={{ fontSize: 32, marginBottom: 12 }}>🎭</div>
          <div style={{ fontSize: 14, fontWeight: 600, color: C.ink, marginBottom: 4 }}>
            Roster coming soon
          </div>
          <p style={{ fontSize: 13, color: C.inkMuted, margin: "0 auto", maxWidth: 360, lineHeight: 1.5 }}>
            {clientProfile.agencyName} is setting up their roster. Reach out directly to submit an inquiry.
          </p>
        </div>
      )}
    </div>
  );
}
