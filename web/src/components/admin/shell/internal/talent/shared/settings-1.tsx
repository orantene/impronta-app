"use client";

import { StatDot } from "../../primitives";
import { COLORS, FONTS, useAdminShell, type TalentContactPolicy } from "../../state";



// ════════════════════════════════════════════════════════════════════
// SETTINGS
// ════════════════════════════════════════════════════════════════════

// Mock count — production reads from the talent's circle table.
export const MOCK_CIRCLE_PREVIEW_COUNT = 6;


/** Talent-side trust card — shows current verification posture + CTAs.
 *  Renders on the talent's Settings page. Tapping opens the talent-trust-detail
 *  drawer for the full lifecycle (Verify Instagram, Request Tulala Review,
 *  see claim status). */
export function TalentTrustCard({ onOpenDetail, primaryAgencyName }: { onOpenDetail: () => void; primaryAgencyName?: string }) {
  // Demo: the prototype's "current talent" maps to roster id `t1` (Marta).
  // In production this comes from the auth session.
  const TALENT_ID = "t1";
  const { getTrustSummary } = useAdminShell();
  const trust = getTrustSummary("talent_profile", TALENT_ID);
  const igActive = trust.badges.some(b => b.type === "instagram_verified" && b.status === "active");
  const tulalaActive = trust.badges.some(b => b.type === "tulala_verified" && b.status === "active");
  const igPending = trust.pendingRequests.some(r => r.verificationType === "instagram_verified");
  const tulalaPending = trust.pendingRequests.some(r => r.verificationType === "tulala_verified");

  const rows: { label: string; status: string; tone: "good" | "pending" | "muted"; emoji: string }[] = [
    {
      label: "Account email",
      status: trust.account?.emailVerified ? "Verified" : "Not verified",
      tone: trust.account?.emailVerified ? "good" : "muted",
      emoji: "✉",
    },
    {
      label: "Profile ownership",
      status: trust.claimStatus === "claimed" ? "Claimed by you"
        : trust.claimStatus === "invite_sent" ? "Invite pending"
        : trust.claimStatus === "unclaimed" ? "Unclaimed"
        : trust.claimStatus ?? "—",
      tone: trust.claimStatus === "claimed" ? "good" : trust.claimStatus === "invite_sent" ? "pending" : "muted",
      emoji: "👤",
    },
    {
      label: "Instagram",
      status: igActive ? "Verified · public badge"
        : igPending ? "Pending review"
        : "Not verified",
      tone: igActive ? "good" : igPending ? "pending" : "muted",
      emoji: "📸",
    },
    {
      label: "Tulala Review",
      status: tulalaActive ? "Verified · public badge"
        : tulalaPending ? "In review"
        : "Not requested",
      tone: tulalaActive ? "good" : tulalaPending ? "pending" : "muted",
      emoji: "✓",
    },
    {
      label: "Agency",
      status: trust.badges.some(b => b.type === "agency_confirmed" && b.status === "active")
        ? `Confirmed by ${primaryAgencyName ?? "your agency"}`
        : "Not confirmed",
      tone: trust.badges.some(b => b.type === "agency_confirmed" && b.status === "active") ? "good" : "muted",
      emoji: "✦",
    },
  ];

  return (
    <button
      type="button"
      onClick={onOpenDetail}
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 14,
        width: "100%",
        padding: "16px 18px",
        marginBottom: 16,
        background: "#fff",
        border: `1px solid ${COLORS.borderSoft}`,
        borderRadius: 14,
        cursor: "pointer",
        fontFamily: FONTS.body,
        textAlign: "left",
        boxShadow: "0 1px 2px rgba(11,11,13,0.03)",
        transition: "border-color 0.15s, box-shadow 0.15s",
      }}
      onMouseEnter={(e) => (e.currentTarget.style.borderColor = COLORS.border)}
      onMouseLeave={(e) => (e.currentTarget.style.borderColor = COLORS.borderSoft)}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <div style={{
            fontSize: 10.5, fontWeight: 600, letterSpacing: 0.5,
            color: COLORS.inkMuted, textTransform: "uppercase", marginBottom: 4,
          }}>Trust & Verification</div>
          <div style={{
            fontFamily: FONTS.display, fontSize: 16, fontWeight: 600,
            color: COLORS.ink, letterSpacing: -0.2,
          }}>
            {igActive && tulalaActive ? "You're fully verified."
              : igActive || tulalaActive ? "Almost there."
              : "Get verified."}
          </div>
        </div>
        <span aria-hidden style={{ color: COLORS.inkDim, fontSize: 18 }}>›</span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {rows.map((r) => (
          <div key={r.label} style={{
            display: "flex", alignItems: "center", gap: 10,
            padding: "8px 10px", borderRadius: 8,
            background: r.tone === "good" ? COLORS.successSoft
              : r.tone === "pending" ? COLORS.amberSoft
              : "rgba(11,11,13,0.03)",
          }}>
            <span style={{ fontSize: 13 }}>{r.emoji}</span>
            <span style={{ flex: 1, fontSize: 12.5, color: COLORS.ink, fontWeight: 500 }}>{r.label}</span>
            <span style={{
              fontSize: 11, fontWeight: 600,
              color: r.tone === "good" ? COLORS.successDeep
                : r.tone === "pending" ? COLORS.amberDeep
                : COLORS.inkMuted,
            }}>{r.status}</span>
          </div>
        ))}
      </div>
    </button>
  );
}


/** Compact "open to all" / "selective · 3 of 4" summary for the card meta. */
export function ContactPolicySummary({ policy }: { policy: TalentContactPolicy }) {
  const allowed = (Object.values(policy) as boolean[]).filter(Boolean).length;
  const total = Object.values(policy).length;
  const allOn = allowed === total;
  return (
    <>
      <StatDot tone={allOn ? "green" : "amber"} />
      {allOn ? "Open to all tiers" : `Selective · ${allowed} of ${total} tiers on`}
    </>
  );
}
