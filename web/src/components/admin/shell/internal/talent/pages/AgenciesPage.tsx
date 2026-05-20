"use client";

import { EmptyState } from "../../primitives";
import { COLORS, FONTS, MY_AGENCIES, RADIUS, useAdminShell } from "../../state";



// ════════════════════════════════════════════════════════════════════
// WS-8.2 Agencies page (split from ReachPage)
// ════════════════════════════════════════════════════════════════════

export function AgenciesPage() {
  const { openDrawer, setTalentPage, toast, bridgeTalentAgencies } = useAdminShell();

  // Bridge-aware: when the layout supplied real agency relationships, use
  // them (even if empty — a freshly-provisioned talent has zero agencies
  // and should see an empty state, not Marta's Atelier Roma + Praline +
  // Estudio Solé). Standalone prototype mode keeps MY_AGENCIES so the
  // demo still looks lively.
  const agencies = bridgeTalentAgencies !== null
    ? bridgeTalentAgencies.map((a) => ({
        id: a.id,
        name: a.agencyName,
        slug: a.agencySlug,
        joinedAt: a.addedAt,
        isPrimary: a.isPrimary,
        // Map bridge `rosterStatus` → demo `status` vocabulary used below.
        // active/exclusive/non-exclusive/ended/pending — anything not
        // explicitly recognized lands as "active".
        status: (["active", "exclusive", "non-exclusive", "ended", "pending"] as const)
          .includes(a.rosterStatus as never)
          ? (a.rosterStatus as "active" | "exclusive" | "non-exclusive" | "ended" | "pending")
          : ("active" as const),
        bookingsYTD: 0, // bridge doesn't carry this yet
        planTier: (["free", "studio", "agency"] as const).includes(a.plan as never)
          ? (a.plan as "free" | "studio" | "agency")
          : ("free" as const),
        commissionRate: 0, // future: derive from plan or per-agency override
      }))
    : MY_AGENCIES;

  return (
    <div style={{ maxWidth: 820, margin: "0 auto", padding: "24px 0" }}>
      {/* Header */}
      <div className="mb-6">
        <h2 style={{ fontSize: 20, fontWeight: 700, fontFamily: FONTS.body, margin: 0 }} className="text-admin-ink">
          Agencies
        </h2>
        <p style={{ fontSize: 13, fontFamily: FONTS.body, margin: "4px 0 0" }} className="text-admin-ink-muted">
          Your agency relationships and representation settings.
        </p>
      </div>

      {/* Active agencies */}
      <section className="mb-6">
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", fontFamily: FONTS.body, marginBottom: 12 }} className="text-admin-ink-dim">
          Your agencies ({agencies.length})
        </div>
        {agencies.length === 0 ? (
          <div style={{ background: "#fff", border: `1px solid ${COLORS.borderSoft}` }} className="rounded-admin-lg">
            <EmptyState
              icon="team"
              title="No agencies yet"
              body="Agencies invite talent — keep your profile up to date so the right ones find you."
              compact
            />
          </div>
        ) : (
        <div className="flex flex-col gap-2">
          {agencies.map((ag) => (
            <div
              key={ag.id}
              style={{
                background:   "#fff",
                border:       `1px solid ${COLORS.borderSoft}`,
                borderRadius: RADIUS.lg,
                padding:      "14px 16px",
                display:      "flex",
                alignItems:   "center",
                gap:          12,
              }}
            >
              {/* Agency avatar */}
              <div style={{ width: 36, height: 36, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, flexShrink: 0 }} className="rounded-admin-md bg-admin-accent-soft">
                🏢
              </div>
              <div className="flex-1 min-w-0">
                <div style={{ fontSize: 13, fontWeight: 600, fontFamily: FONTS.body }} className="text-admin-ink">
                  {ag.name}
                </div>
                <div style={{ fontSize: 11, fontFamily: FONTS.body, marginTop: 1 }} className="text-admin-ink-muted">
                  {ag.status === "exclusive" ? "Exclusive · " : "Non-exclusive · "}
                  {ag.commissionRate * 100}% commission
                </div>
              </div>
              {/* Status chip */}
              <div style={{ fontSize:     10, fontWeight: 700, padding:      "2px 8px", background:   ag.status === "active" ? COLORS.accentSoft : COLORS.card, color:        ag.status === "active" ? COLORS.accent : COLORS.inkMuted, fontFamily:   FONTS.body }} className="rounded-admin-sm">
                {ag.status}
              </div>
              <button
                type="button"
                onClick={() => openDrawer("talent-agency-relationship", { agencyId: ag.id })}
                style={{
                  background: "none", border: `1px solid ${COLORS.borderSoft}`, borderRadius: RADIUS.sm,
                  padding: "4px 10px", cursor: "pointer", fontSize: 11, color: COLORS.inkMuted,
                  fontFamily: FONTS.body, fontWeight: 600,
                }}
              >
                Manage →
              </button>
            </div>
          ))}
        </div>
        )}
      </section>

      {/* Leave agency CTA */}
      <section style={{ background: "rgba(220,38,38,0.04)", border:     "1px solid rgba(220,38,38,0.12)", padding:    "14px 16px", marginBottom: 24 }} className="rounded-admin-lg">
        <div style={{ fontSize: 12, fontWeight: 600, color: "#dc2626", fontFamily: FONTS.body, marginBottom: 4 }}>
          Leave an agency
        </div>
        <p style={{ fontSize: 12, fontFamily: FONTS.body, margin: "0 0 10px" }} className="text-admin-ink-muted">
          Ending representation is permanent and will cancel any active holds or bookings
          assigned through that agency.
        </p>
        <button
          type="button"
          onClick={() => openDrawer("talent-leave-agency")}
          style={{
            background: "rgba(220,38,38,0.08)", border: "1px solid rgba(220,38,38,0.18)",
            color: "#dc2626", borderRadius: RADIUS.md, padding: "5px 12px",
            fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: FONTS.body,
          }}
        >
          Manage representation →
        </button>
      </section>

      {/* Share profile with agencies */}
      <section>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", fontFamily: FONTS.body, marginBottom: 12 }} className="text-admin-ink-dim">
          Work with more agencies
        </div>
        <p style={{ fontSize: 12, fontFamily: FONTS.body, margin: "0 0 12px" }} className="text-admin-ink-muted">
          On Tulala, agencies invite talent — not the other way around. Share your public profile with an agency and they can request you onto their roster.
        </p>
        <button
          type="button"
          onClick={() => openDrawer("talent-agency-relationship", { mode: "add" })}
          style={{
            display: "inline-flex", alignItems: "center", gap: 6,
            background: COLORS.fill, color: "#fff",
            border: "none", borderRadius: RADIUS.md,
            padding: "8px 16px", fontSize: 13, fontWeight: 600,
            cursor: "pointer", fontFamily: FONTS.body,
          }}
        >
          Share my profile →
        </button>
      </section>
    </div>
  );
}
