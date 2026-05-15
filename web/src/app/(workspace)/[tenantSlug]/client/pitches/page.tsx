// Step 8 — Client Pitch History.
//
// Surface for the registered-client view of every pitch the user has
// received (declined / approved / converted / sent / etc.). Each row
// deep-links back to the public pitch landing `/share/pitch/<token>`
// where the client can act on the pitch.
//
// Source spec: web/docs/inquiry-funnel-execution-plan-2026-05-13.md Step 8.
//
// Scope: this page shows *all* pitches the client has received across
// agencies — not just the current tenant. A client's pitch history is
// an account-global record, but the route is namespaced by tenantSlug
// because the client shell is keyed by an agency relationship.

import { notFound } from "next/navigation";
import { getTenantPortalScopeBySlug } from "@/lib/saas/scope";
import { getCachedActorSession } from "@/lib/server/request-cache";
import { loadClientSelfProfile, loadClientPitches } from "../../_data-bridge";
import { formatClientDate as fmtClientDate } from "../date-format";

export const dynamic = "force-dynamic";
type PageParams = Promise<{ tenantSlug: string }>;

const C = {
  ink:         "#0B0B0D",
  inkMuted:    "rgba(11,11,13,0.55)",
  inkDim:      "rgba(11,11,13,0.35)",
  borderSoft:  "rgba(24,24,27,0.08)",
  cardBg:      "#ffffff",
  surface:     "rgba(11,11,13,0.02)",
  accent:      "#1D4ED8",
  accentSoft:  "rgba(29,78,216,0.08)",
  blueDeep:    "#1D4ED8",
  successDeep: "#1A7348",
  successSoft: "rgba(26,115,72,0.10)",
  amberDeep:   "#8A6F1A",
  amberSoft:   "rgba(138,111,26,0.10)",
} as const;

const FONT = '"Inter", system-ui, sans-serif';
const FONT_DISPLAY =
  'var(--font-geist-sans), "Inter", -apple-system, system-ui, sans-serif';

type PitchStatus =
  | "draft"
  | "sent"
  | "viewed"
  | "edited"
  | "approved"
  | "converted"
  | "declined"
  | "cancelled"
  | "expired";

function statusTone(status: PitchStatus) {
  // 4-family palette mirroring the inquiries page so the client sees
  // consistent semantics across surfaces (positive=green, in-progress=blue,
  // attention=amber, terminal-neutral=dim).
  const map: Record<PitchStatus, { bg: string; color: string; label: string }> = {
    draft:     { bg: C.surface,     color: C.inkDim,     label: "Draft" },
    sent:      { bg: C.accentSoft,  color: C.blueDeep,   label: "Sent" },
    viewed:    { bg: C.accentSoft,  color: C.blueDeep,   label: "Viewed" },
    edited:    { bg: C.amberSoft,   color: C.amberDeep,  label: "Edited" },
    approved:  { bg: C.successSoft, color: C.successDeep, label: "Approved" },
    converted: { bg: C.successSoft, color: C.successDeep, label: "Converted" },
    declined:  { bg: C.surface,     color: C.inkDim,     label: "Declined" },
    cancelled: { bg: C.surface,     color: C.inkDim,     label: "Cancelled" },
    expired:   { bg: C.surface,     color: C.inkDim,     label: "Expired" },
  };
  return map[status];
}

/**
 * The action verb on each row depends on the pitch's current state:
 *   sent | viewed | edited → "Open" (recipient hasn't acted)
 *   approved              → "Continue" (next step: submit as inquiry)
 *   converted             → "View" (terminal — pitch is done)
 *   declined | expired | cancelled → "View" (read-only)
 */
function actionLabel(status: PitchStatus): string {
  if (status === "sent" || status === "viewed" || status === "edited") return "Open";
  if (status === "approved") return "Continue";
  return "View";
}

export default async function ClientPitchesPage({ params }: { params: PageParams }) {
  const { tenantSlug } = await params;

  const session = await getCachedActorSession();
  if (!session.user) notFound();

  const scope = await getTenantPortalScopeBySlug(tenantSlug);
  if (!scope) notFound();

  // Same gate as the inquiries page — must be a registered client with
  // an existing relationship to this agency.
  const clientProfile = await loadClientSelfProfile(session.user.id, scope.tenantId);
  if (!clientProfile) notFound();

  const pitches = await loadClientPitches(session.user.id);

  return (
    <div style={{ fontFamily: FONT, color: C.ink }}>
      {/* ── Header ── */}
      <header style={{ marginBottom: 28 }}>
        <h1
          style={{
            fontFamily: FONT_DISPLAY,
            fontSize: 28,
            fontWeight: 600,
            letterSpacing: -0.4,
            margin: 0,
            color: C.ink,
          }}
        >
          Pitches
        </h1>
        <p style={{ fontSize: 14, color: C.inkMuted, margin: "6px 0 0", lineHeight: 1.5 }}>
          Talent suggestions sent to you. Open one to approve, decline, or submit it
          as an inquiry.
        </p>
      </header>

      {pitches.length === 0 ? (
        <div
          style={{
            background: C.cardBg,
            border: `1px solid ${C.borderSoft}`,
            borderRadius: 14,
            padding: "36px 24px",
            textAlign: "center",
            color: C.inkMuted,
            fontSize: 13.5,
            lineHeight: 1.55,
          }}
        >
          <div style={{ fontSize: 15, fontWeight: 600, color: C.ink, marginBottom: 6 }}>
            No pitches yet
          </div>
          <p style={{ margin: 0 }}>
            When an agency sends you a pitch, it&apos;ll show up here so you can
            track and revisit it any time.
          </p>
        </div>
      ) : (
        <div
          style={{
            background: C.cardBg,
            border: `1px solid ${C.borderSoft}`,
            borderRadius: 14,
            overflow: "hidden",
          }}
        >
          {pitches.map((pitch, idx) => {
            const s = statusTone(pitch.status);
            const sentDate = pitch.sentAt ?? pitch.createdAt;
            // Approved pitches that haven't converted yet are the
            // "needs me" rows — surface them with a soft tint, matching
            // the inquiries page's needsAction convention.
            const needsAction = pitch.status === "approved";
            return (
              <a
                key={pitch.id}
                href={pitch.shareUrl}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr auto",
                  gap: 16,
                  alignItems: "center",
                  padding: "16px 20px",
                  borderBottom:
                    idx < pitches.length - 1 ? `1px solid ${C.borderSoft}` : "none",
                  background: needsAction ? "rgba(26,115,72,0.04)" : "transparent",
                  textDecoration: "none",
                  color: "inherit",
                  transition: "background 0.1s",
                }}
              >
                <div style={{ minWidth: 0 }}>
                  {/* Status pill */}
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                    <span
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        padding: "2px 8px",
                        borderRadius: 999,
                        background: s.bg,
                        color: s.color,
                        fontSize: 10.5,
                        fontWeight: 700,
                        letterSpacing: 0.3,
                        textTransform: "uppercase",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {s.label}
                    </span>
                    {needsAction && (
                      <span
                        style={{
                          fontSize: 10.5,
                          fontWeight: 700,
                          letterSpacing: 0.3,
                          textTransform: "uppercase",
                          color: C.successDeep,
                        }}
                      >
                        Next step ready
                      </span>
                    )}
                  </div>

                  {/* Agency name + talent count */}
                  <div
                    style={{
                      fontSize: 15,
                      fontWeight: 600,
                      color: C.ink,
                      letterSpacing: -0.1,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {pitch.agencyName}
                  </div>

                  {/* Meta line */}
                  <div
                    style={{
                      fontSize: 12.5,
                      color: C.inkMuted,
                      marginTop: 3,
                      display: "flex",
                      flexWrap: "wrap",
                      alignItems: "center",
                      gap: 6,
                    }}
                  >
                    <span>
                      {pitch.talentCount} talent
                      {pitch.talentCount === 1 ? "" : "s"}
                    </span>
                    <span aria-hidden style={{ color: C.inkDim }}>·</span>
                    <span>Sent {fmtClientDate(sentDate)}</span>
                    {pitch.expiresAt && pitch.status !== "converted" && (
                      <>
                        <span aria-hidden style={{ color: C.inkDim }}>·</span>
                        <span>Expires {fmtClientDate(pitch.expiresAt)}</span>
                      </>
                    )}
                  </div>

                  {/* Personal note preview */}
                  {pitch.personalNotePreview && (
                    <p
                      style={{
                        fontSize: 12.5,
                        color: C.inkMuted,
                        marginTop: 8,
                        marginBottom: 0,
                        lineHeight: 1.45,
                        fontStyle: "italic",
                        display: "-webkit-box",
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: "vertical",
                        overflow: "hidden",
                      }}
                    >
                      “{pitch.personalNotePreview}”
                    </p>
                  )}
                </div>

                {/* Action verb */}
                <div
                  style={{
                    fontSize: 13,
                    fontWeight: 600,
                    color: needsAction ? C.successDeep : C.accent,
                    whiteSpace: "nowrap",
                  }}
                >
                  {actionLabel(pitch.status)} <span aria-hidden>→</span>
                </div>
              </a>
            );
          })}
        </div>
      )}
    </div>
  );
}
