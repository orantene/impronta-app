// Phase 3.3 — talent Profile page.
// Shows the talent's profile summary and links to edit via legacy editor.

import { notFound } from "next/navigation";
import Link from "next/link";
import { getTenantPortalScopeBySlug } from "@/lib/saas/scope";
import { getCachedActorSession } from "@/lib/server/request-cache";
import { loadTalentSelfProfile } from "../../_data-bridge";

export const dynamic = "force-dynamic";
type PageParams = Promise<{ tenantSlug: string }>;

const C = {
  ink:         "#0B0B0D",
  inkMuted:    "rgba(11,11,13,0.55)",
  inkDim:      "rgba(11,11,13,0.35)",
  borderSoft:  "rgba(24,24,27,0.08)",
  cardBg:      "#ffffff",
  surface:     "rgba(11,11,13,0.02)",
  surfaceAlt:  "rgba(11,11,13,0.025)",
  accent:      "#0F4F3E",
  accentSoft:  "rgba(15,79,62,0.08)",
  fill:        "#0F4F3E",
  successDeep: "#1A7348",
  successSoft: "rgba(26,115,72,0.10)",
  amberDeep:   "#8A6F1A",
  amberSoft:   "rgba(138,111,26,0.10)",
  indigoDeep:  "#2B3FA3",
  indigoSoft:  "rgba(43,63,163,0.07)",
} as const;

const FONT = '"Inter", system-ui, sans-serif';

function SectionCard({
  title,
  description,
  href,
  status,
}: {
  title: string;
  description: string;
  href: string;
  status?: "complete" | "incomplete" | "review";
}) {
  const s = status === "complete"
    ? { dot: C.successDeep, label: "Complete" }
    : status === "review"
    ? { dot: C.amberDeep, label: "Review" }
    : { dot: C.inkDim, label: "Incomplete" };

  return (
    <Link
      href={href}
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
        padding: "14px 16px",
        textDecoration: "none",
        borderBottom: `1px solid ${C.borderSoft}`,
        fontFamily: FONT,
        transition: "background 100ms",
      }}
      className="profile-row"
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13.5, fontWeight: 600, color: C.ink, letterSpacing: -0.1 }}>{title}</div>
        <div style={{ fontSize: 12, color: C.inkMuted, marginTop: 2 }}>{description}</div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
        {status && (
          <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11, fontWeight: 600, color: s.dot }}>
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: s.dot }} />
            {s.label}
          </span>
        )}
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={C.inkDim} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M9 5l7 7-7 7" />
        </svg>
      </div>
    </Link>
  );
}

export default async function TalentProfilePage({ params }: { params: PageParams }) {
  const { tenantSlug } = await params;
  const session = await getCachedActorSession();
  if (!session.user) notFound();

  const scope = await getTenantPortalScopeBySlug(tenantSlug);
  if (!scope) notFound();

  const talentProfile = await loadTalentSelfProfile(session.user.id, scope.tenantId);
  if (!talentProfile) notFound();

  const isPublished = talentProfile.workflowStatus === "published";
  const publicProfileUrl = talentProfile.profileCode
    ? `https://tulala.digital/t/${talentProfile.profileCode}`
    : null;

  // Derive section completeness from real data
  const identityComplete = !!(talentProfile.displayName && talentProfile.primaryTypeLabel && talentProfile.homeCity);
  const mediaComplete = !!talentProfile.headshotUrl;
  const measurementsComplete = talentProfile.hasHeight;
  const experienceComplete = false; // requires credits data — always prompt to fill

  // Profile editor is the legacy route — still fully functional
  const editBase = `/talent/my-profile`;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24, fontFamily: FONT }}>
      <style>{`.profile-row:hover { background: ${C.surfaceAlt}; }`}</style>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
        <div>
          <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: 0.7, textTransform: "uppercase", color: C.accent, marginBottom: 4 }}>
            {talentProfile.agencyName}
          </div>
          <h1 style={{ fontFamily: FONT, fontSize: 26, fontWeight: 700, color: C.ink, margin: 0, letterSpacing: -0.5, lineHeight: 1.1 }}>
            Profile
          </h1>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {publicProfileUrl && (
            <a
              href={publicProfileUrl}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: "inline-flex", alignItems: "center", gap: 5, height: 34, padding: "0 14px",
                borderRadius: 8, border: `1px solid ${C.borderSoft}`, background: C.cardBg,
                color: C.ink, fontSize: 12.5, fontWeight: 600, textDecoration: "none", fontFamily: FONT,
              }}
            >
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6M15 3h6v6M10 14L21 3" />
              </svg>
              Preview as client ↗
            </a>
          )}
          <Link
            href={editBase}
            style={{
              display: "inline-flex", alignItems: "center", gap: 5, height: 34, padding: "0 14px",
              borderRadius: 8, background: C.fill, color: "#fff",
              fontSize: 12.5, fontWeight: 600, textDecoration: "none", fontFamily: FONT,
            }}
          >
            Edit profile
          </Link>
        </div>
      </div>

      {/* Profile hero card */}
      <div
        style={{
          background: `linear-gradient(135deg, ${C.fill} 0%, #0A3830 100%)`,
          borderRadius: 14,
          padding: 20,
          color: "#fff",
          fontFamily: FONT,
          display: "flex",
          alignItems: "center",
          gap: 18,
          flexWrap: "wrap",
        }}
      >
        {/* Avatar */}
        {talentProfile.headshotUrl ? (
          <div
            style={{
              width: 64,
              height: 64,
              borderRadius: "50%",
              flexShrink: 0,
              overflow: "hidden",
              border: "2px solid rgba(255,255,255,0.25)",
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={talentProfile.headshotUrl}
              alt={talentProfile.displayName}
              width={64}
              height={64}
              style={{ width: "100%", height: "100%", objectFit: "cover" }}
            />
          </div>
        ) : (
          <div
            style={{
              width: 64,
              height: 64,
              borderRadius: "50%",
              background: "rgba(255,255,255,0.15)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 22,
              fontWeight: 700,
              flexShrink: 0,
              letterSpacing: -0.5,
            }}
          >
            {talentProfile.displayName.charAt(0).toUpperCase()}
          </div>
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: -0.3, lineHeight: 1.1 }}>
            {talentProfile.displayName}
          </div>
          {talentProfile.primaryTypeLabel && (
            <div style={{ fontSize: 13, color: "rgba(255,255,255,0.75)", marginTop: 3 }}>
              {talentProfile.primaryTypeLabel}
            </div>
          )}
          {talentProfile.homeCity && (
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.60)", marginTop: 2 }}>
              📍 {talentProfile.homeCity}
            </div>
          )}
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6 }}>
          <span
            style={{
              display: "inline-flex", alignItems: "center", gap: 5,
              padding: "4px 10px", borderRadius: 999,
              background: isPublished ? "rgba(91,216,147,0.20)" : "rgba(255,255,255,0.12)",
              fontSize: 11.5, fontWeight: 700,
              color: isPublished ? "#5BD893" : "rgba(255,255,255,0.70)",
              letterSpacing: 0.3, textTransform: "uppercase" as const,
            }}
          >
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: isPublished ? "#5BD893" : "rgba(255,255,255,0.50)" }} />
            {isPublished ? "Live" : talentProfile.workflowStatus}
          </span>
        </div>
      </div>

      {/* Completeness banner */}
      {(() => {
        const sections = [identityComplete, mediaComplete, measurementsComplete, experienceComplete];
        const doneCount = sections.filter(Boolean).length;
        const total = sections.length;
        const pct = Math.round((doneCount / total) * 100);
        if (pct === 100) return null;
        return (
          <div
            style={{
              background: pct >= 50 ? C.accentSoft : C.amberSoft,
              border: `1px solid ${pct >= 50 ? "rgba(15,79,62,0.15)" : "rgba(138,111,26,0.18)"}`,
              borderRadius: 12,
              padding: "14px 18px",
              fontFamily: FONT,
              display: "flex",
              alignItems: "center",
              gap: 14,
            }}
          >
            {/* Dial */}
            <div style={{ flexShrink: 0, position: "relative", width: 44, height: 44 }}>
              <svg width="44" height="44" viewBox="0 0 44 44" style={{ transform: "rotate(-90deg)" }} aria-hidden>
                <circle cx="22" cy="22" r="18" fill="none" stroke="rgba(0,0,0,0.08)" strokeWidth="4" />
                <circle
                  cx="22" cy="22" r="18"
                  fill="none"
                  stroke={pct >= 50 ? C.accent : C.amberDeep}
                  strokeWidth="4"
                  strokeDasharray={`${2 * Math.PI * 18}`}
                  strokeDashoffset={`${2 * Math.PI * 18 * (1 - pct / 100)}`}
                  strokeLinecap="round"
                />
              </svg>
              <div style={{
                position: "absolute", inset: 0,
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 11, fontWeight: 700,
                color: pct >= 50 ? C.accent : C.amberDeep,
              }}>
                {pct}%
              </div>
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: C.ink, letterSpacing: -0.1 }}>
                {doneCount} of {total} sections complete
              </div>
              <div style={{ fontSize: 11.5, color: C.inkMuted, marginTop: 2 }}>
                {pct < 50
                  ? "Add more info to get discovered by clients."
                  : "Almost there — finish the remaining sections."}
              </div>
            </div>
            <Link
              href={editBase}
              style={{
                flexShrink: 0,
                display: "inline-flex", alignItems: "center",
                height: 30, padding: "0 12px", borderRadius: 8,
                background: pct >= 50 ? C.accent : C.amberDeep,
                color: "#fff", fontSize: 12, fontWeight: 600,
                textDecoration: "none", fontFamily: FONT,
              }}
            >
              Complete →
            </Link>
          </div>
        );
      })()}

      {/* Profile sections */}
      <section>
        <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: 0.7, textTransform: "uppercase" as const, color: C.inkDim, marginBottom: 10 }}>
          Profile sections
        </div>
        <div style={{ background: C.cardBg, border: `1px solid ${C.borderSoft}`, borderRadius: 14, overflow: "hidden" }}>
          <SectionCard
            href={`${editBase}#identity`}
            title="Identity & basics"
            description="Name, type, location, bio, and contact info"
            status={identityComplete ? "complete" : "incomplete"}
          />
          <SectionCard
            href={`${editBase}#media`}
            title="Media & portfolio"
            description="Polaroids, lookbook images, and video clips"
            status={mediaComplete ? "complete" : "incomplete"}
          />
          <SectionCard
            href={`${editBase}#measurements`}
            title="Measurements & stats"
            description="Height, sizes, and physical attributes"
            status={measurementsComplete ? "complete" : "incomplete"}
          />
          <SectionCard
            href={`${editBase}#experience`}
            title="Experience & credits"
            description="Previous campaigns, shows, and editorial work"
            status={experienceComplete ? "complete" : "incomplete"}
          />
          <div style={{ padding: "14px 16px" }}>
            <Link
              href={editBase}
              style={{
                display: "inline-flex", alignItems: "center", gap: 5,
                height: 34, padding: "0 16px", borderRadius: 8,
                background: C.accentSoft, color: C.accent,
                fontSize: 12.5, fontWeight: 600, textDecoration: "none", fontFamily: FONT,
              }}
            >
              Open full editor →
            </Link>
          </div>
        </div>
      </section>

      {/* Profile status card */}
      <section
        style={{
          background: C.cardBg,
          border: `1px solid ${C.borderSoft}`,
          borderRadius: 14,
          padding: "16px 20px",
        }}
      >
        <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: 0.7, textTransform: "uppercase" as const, color: C.inkDim, marginBottom: 12 }}>
          Visibility
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, fontSize: 13 }}>
            <span style={{ color: C.inkMuted }}>Profile status</span>
            <span style={{ fontWeight: 600, color: isPublished ? C.successDeep : C.amberDeep, textTransform: "capitalize" as const }}>
              {isPublished ? "Published" : talentProfile.workflowStatus}
            </span>
          </div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, fontSize: 13 }}>
            <span style={{ color: C.inkMuted }}>Roster status</span>
            <span style={{ fontWeight: 600, color: talentProfile.rosterStatus === "active" ? C.successDeep : C.amberDeep, textTransform: "capitalize" as const }}>
              {talentProfile.rosterStatus}
            </span>
          </div>
          {publicProfileUrl && (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, fontSize: 13 }}>
              <span style={{ color: C.inkMuted }}>Public URL</span>
              <a
                href={publicProfileUrl}
                target="_blank"
                rel="noopener noreferrer"
                style={{ fontWeight: 500, color: C.indigoDeep, textDecoration: "none", fontFamily: '"ui-monospace", monospace', fontSize: 12 }}
              >
                /t/{talentProfile.profileCode} ↗
              </a>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
