// Phase 3.3 — talent Agencies page.
// Shows the talent's agency relationships across all tenants.

import { notFound } from "next/navigation";
import Link from "next/link";
import { getTenantScopeBySlug } from "@/lib/saas/scope";
import { getCachedActorSession } from "@/lib/server/request-cache";
import { loadTalentSelfProfile, loadTalentAgencies } from "../../_data-bridge";

export const dynamic = "force-dynamic";
type PageParams = Promise<{ tenantSlug: string }>;

const C = {
  ink:         "#0B0B0D",
  inkMuted:    "rgba(11,11,13,0.55)",
  inkDim:      "rgba(11,11,13,0.35)",
  borderSoft:  "rgba(24,24,27,0.08)",
  cardBg:      "#ffffff",
  surfaceAlt:  "rgba(11,11,13,0.025)",
  accent:      "#0F4F3E",
  accentSoft:  "rgba(15,79,62,0.08)",
  fill:        "#0F4F3E",
  successDeep: "#1A7348",
  successSoft: "rgba(26,115,72,0.10)",
  amberDeep:   "#8A6F1A",
  amberSoft:   "rgba(138,111,26,0.10)",
} as const;

const FONT = '"Inter", system-ui, sans-serif';

const PLAN_CHIP: Record<string, { bg: string; color: string; label: string }> = {
  free:    { bg: "rgba(82,96,109,0.10)",  color: "rgba(11,11,13,0.72)", label: "Free"    },
  studio:  { bg: "rgba(180,130,20,0.12)", color: "#7A5710",             label: "Studio"  },
  agency:  { bg: "rgba(15,79,62,0.10)",   color: "#0F4F3E",             label: "Agency"  },
  network: { bg: "rgba(91,60,140,0.10)",  color: "#5B3C8C",             label: "Network" },
};

function fmtDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  } catch { return "—"; }
}

export default async function TalentAgenciesPage({ params }: { params: PageParams }) {
  const { tenantSlug } = await params;
  const session = await getCachedActorSession();
  if (!session.user) notFound();

  const scope = await getTenantScopeBySlug(tenantSlug);
  if (!scope) notFound();

  const talentProfile = await loadTalentSelfProfile(session.user.id, scope.tenantId);
  if (!talentProfile) notFound();

  const agencies = await loadTalentAgencies(talentProfile.id);

  const activeAgencies  = agencies.filter((a) => a.rosterStatus === "active");
  const pendingAgencies = agencies.filter((a) => a.rosterStatus === "pending");
  const pausedAgencies  = agencies.filter((a) => a.rosterStatus === "paused");

  function AgencyCard({ agency }: { agency: typeof agencies[0] }) {
    const plan = PLAN_CHIP[agency.plan] ?? PLAN_CHIP.free;
    const isCurrent = agency.agencySlug === tenantSlug;
    const dotColor = agency.rosterStatus === "active" ? C.successDeep : C.amberDeep;
    const statusLabel = agency.rosterStatus === "active" ? "Active" : agency.rosterStatus === "pending" ? "Pending" : "Paused";
    return (
      <div
        style={{
          background: C.cardBg,
          border: `1px solid ${isCurrent ? "rgba(15,79,62,0.30)" : C.borderSoft}`,
          borderRadius: 12,
          padding: "16px 18px",
          fontFamily: FONT,
          position: "relative",
        }}
      >
        {isCurrent && (
          <span
            style={{
              position: "absolute",
              top: 12,
              right: 12,
              fontSize: 10,
              fontWeight: 700,
              padding: "1px 7px",
              borderRadius: 999,
              background: C.accentSoft,
              color: C.accent,
              letterSpacing: 0.4,
              textTransform: "uppercase" as const,
            }}
          >
            Current
          </span>
        )}
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
          <div
            style={{
              width: 38,
              height: 38,
              borderRadius: 10,
              background: C.accentSoft,
              color: C.accent,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 14,
              fontWeight: 700,
              flexShrink: 0,
            }}
          >
            {agency.agencyName.charAt(0).toUpperCase()}
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: C.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {agency.agencyName}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 2 }}>
              <span
                style={{
                  padding: "1px 6px",
                  borderRadius: 999,
                  background: plan.bg,
                  color: plan.color,
                  fontSize: 10,
                  fontWeight: 700,
                  letterSpacing: 0.3,
                }}
              >
                {plan.label}
              </span>
            </div>
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 5, fontSize: 11.5 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
            <span style={{ color: C.inkMuted }}>Status</span>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontWeight: 600, color: dotColor }}>
              <span style={{ width: 5, height: 5, borderRadius: "50%", background: dotColor }} />
              {statusLabel}
            </span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
            <span style={{ color: C.inkMuted }}>Added</span>
            <span style={{ color: C.ink, fontWeight: 500 }}>{fmtDate(agency.addedAt)}</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24, fontFamily: FONT }}>
      {/* Header */}
      <div>
        <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: 0.7, textTransform: "uppercase", color: C.accent, marginBottom: 4 }}>
          {talentProfile.agencyName}
        </div>
        <h1 style={{ fontFamily: FONT, fontSize: 26, fontWeight: 700, color: C.ink, margin: 0, letterSpacing: -0.5, lineHeight: 1.1 }}>
          Agencies
        </h1>
        <p style={{ fontFamily: FONT, fontSize: 13, color: C.inkMuted, margin: "4px 0 0" }}>
          {agencies.length === 0 ? "No agency relationships yet." : `${activeAgencies.length} active · ${pendingAgencies.length} pending`}
        </p>
      </div>

      {agencies.length === 0 ? (
        <div style={{ padding: "48px 20px", textAlign: "center", background: "rgba(11,11,13,0.02)", border: "1px dashed rgba(24,24,27,0.08)", borderRadius: 14 }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>🏢</div>
          <div style={{ fontSize: 14, fontWeight: 600, color: C.ink, marginBottom: 4 }}>No agency relationships</div>
          <p style={{ fontSize: 13, color: C.inkMuted, margin: "0 auto", maxWidth: 320, lineHeight: 1.5 }}>
            When an agency adds you to their roster, your relationship will appear here.
          </p>
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 12 }}>
          {/* Current agency first */}
          {[...agencies].sort((a, b) => (b.agencySlug === tenantSlug ? 1 : 0) - (a.agencySlug === tenantSlug ? 1 : 0))
            .map((agency) => (
              <AgencyCard key={agency.id} agency={agency} />
            ))}
        </div>
      )}

      {/* Info note about exclusivity */}
      {activeAgencies.length > 1 && (
        <div
          style={{
            padding: "12px 16px",
            borderRadius: 10,
            background: C.amberSoft,
            border: `1px solid rgba(138,111,26,0.20)`,
            fontSize: 13,
            color: C.amberDeep,
            lineHeight: 1.5,
            fontFamily: FONT,
          }}
        >
          <strong>Multiple agencies:</strong> You appear on multiple agency rosters. Your primary agency coordinates exclusive bookings. Check with your agencies about exclusivity terms.
        </div>
      )}
    </div>
  );
}
