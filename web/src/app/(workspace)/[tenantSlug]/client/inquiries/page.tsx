// Phase 3.10 — Client Inquiries page.
// Full list of all inquiries this client has submitted to this agency,
// with status chips, event details, and timestamps.

import { notFound } from "next/navigation";
import { getTenantScopeBySlug } from "@/lib/saas/scope";
import { getCachedActorSession } from "@/lib/server/request-cache";
import { loadClientSelfProfile, loadClientInquiries } from "../../_data-bridge";

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
  successDeep: "#1A7348",
  successSoft: "rgba(26,115,72,0.10)",
  amberDeep:  "#8A6F1A",
  amberSoft:  "rgba(138,111,26,0.10)",
} as const;

const FONT = '"Inter", system-ui, sans-serif';
const FONT_DISPLAY = 'var(--font-geist-sans), "Inter", -apple-system, system-ui, sans-serif';

function statusTone(status: string) {
  const map: Record<string, { bg: string; color: string; label: string }> = {
    booked:        { bg: C.successSoft,  color: C.successDeep, label: "Booked" },
    converted:     { bg: C.successSoft,  color: C.successDeep, label: "Booked" },
    approved:      { bg: C.accentSoft,   color: C.accent,      label: "Approved" },
    offer_pending: { bg: C.amberSoft,    color: C.amberDeep,   label: "Offer pending" },
    submitted:     { bg: C.accentSoft,   color: C.blueDeep,    label: "Submitted" },
    coordination:  { bg: C.accentSoft,   color: C.blueDeep,    label: "In review" },
    rejected:      { bg: C.surface,      color: C.inkDim,      label: "Declined" },
    expired:       { bg: C.surface,      color: C.inkDim,      label: "Expired" },
    draft:         { bg: C.surface,      color: C.inkDim,      label: "Draft" },
    closed:        { bg: C.surface,      color: C.inkDim,      label: "Closed" },
    closed_lost:   { bg: C.surface,      color: C.inkDim,      label: "Closed" },
    archived:      { bg: C.surface,      color: C.inkDim,      label: "Archived" },
  };
  return map[status] ?? { bg: C.surface, color: C.inkDim, label: status.replace(/_/g, " ") };
}

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  } catch {
    return "—";
  }
}

function relativeDate(iso: string): string {
  const now = Date.now();
  const then = new Date(iso).getTime();
  const diffMs = now - then;
  const diffH = diffMs / (1000 * 60 * 60);
  if (diffH < 1) return "just now";
  if (diffH < 24) return `${Math.floor(diffH)}h ago`;
  const diffD = diffH / 24;
  if (diffD < 7) return `${Math.floor(diffD)}d ago`;
  return fmtDate(iso);
}

function isTerminal(status: string) {
  return ["booked", "converted", "rejected", "expired", "closed", "closed_lost", "archived"].includes(status);
}

export default async function ClientInquiriesPage({ params }: { params: PageParams }) {
  const { tenantSlug } = await params;
  const session = await getCachedActorSession();
  if (!session.user) notFound();

  const scope = await getTenantScopeBySlug(tenantSlug);
  if (!scope) notFound();

  const clientProfile = await loadClientSelfProfile(session.user.id, scope.tenantId);
  if (!clientProfile) notFound();

  const inquiries = await loadClientInquiries(session.user.id, scope.tenantId);

  const open   = inquiries.filter((i) => !isTerminal(i.status));
  const closed = inquiries.filter((i) => isTerminal(i.status));

  function InquiryTable({ rows, label }: { rows: typeof inquiries; label: string }) {
    if (rows.length === 0) return null;
    return (
      <section>
        <div
          style={{
            fontSize: 10.5,
            fontWeight: 700,
            letterSpacing: 0.8,
            textTransform: "uppercase",
            color: C.inkMuted,
            marginBottom: 10,
            fontFamily: FONT,
          }}
        >
          {label} ({rows.length})
        </div>
        <div style={{ background: C.cardBg, border: `1px solid ${C.borderSoft}`, borderRadius: 14, overflow: "hidden" }}>
          {rows.map((inq, idx) => {
            const s = statusTone(inq.status);
            const needsAction = inq.next_action_by === "client";
            return (
              <div
                key={inq.id}
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr auto",
                  gap: 16,
                  alignItems: "center",
                  padding: "14px 18px",
                  borderBottom: idx < rows.length - 1 ? `1px solid ${C.borderSoft}` : "none",
                  fontFamily: FONT,
                  background: needsAction ? "rgba(29,78,216,0.03)" : "transparent",
                }}
              >
                <div style={{ minWidth: 0 }}>
                  {/* Status + action indicator */}
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 5 }}>
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
                        textTransform: "uppercase" as const,
                        fontFamily: FONT,
                        whiteSpace: "nowrap",
                      }}
                    >
                      {s.label}
                    </span>
                    {needsAction && (
                      <span
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 4,
                          padding: "1px 7px",
                          borderRadius: 999,
                          background: C.accentSoft,
                          color: C.blueDeep,
                          fontSize: 10,
                          fontWeight: 700,
                          letterSpacing: 0.3,
                          fontFamily: FONT,
                        }}
                      >
                        <span style={{ width: 5, height: 5, borderRadius: "50%", background: C.blueDeep, display: "inline-block" }} />
                        Your turn
                      </span>
                    )}
                  </div>

                  {/* Primary line */}
                  <div
                    style={{
                      fontSize: 13.5,
                      fontWeight: 600,
                      color: C.ink,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                      letterSpacing: -0.1,
                    }}
                  >
                    {inq.company ?? "Booking inquiry"}
                    {inq.event_location && (
                      <span style={{ fontWeight: 400, color: C.inkMuted, marginLeft: 8 }}>
                        · {inq.event_location}
                      </span>
                    )}
                  </div>

                  {/* Meta */}
                  <div style={{ display: "flex", gap: 14, marginTop: 3 }}>
                    {inq.event_date && (
                      <span style={{ fontSize: 12, color: C.inkMuted }}>
                        📅 {fmtDate(inq.event_date)}
                      </span>
                    )}
                    {inq.quantity && (
                      <span style={{ fontSize: 12, color: C.inkMuted }}>
                        {inq.quantity} talent
                      </span>
                    )}
                  </div>
                </div>

                <div
                  style={{
                    textAlign: "right",
                    flexShrink: 0,
                    fontSize: 11.5,
                    color: C.inkDim,
                    fontFamily: FONT,
                  }}
                >
                  {relativeDate(inq.created_at)}
                </div>
              </div>
            );
          })}
        </div>
      </section>
    );
  }

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
          Your inquiries
        </h1>
        <p style={{ fontSize: 13, color: C.inkMuted, margin: "6px 0 0" }}>
          {inquiries.length === 0
            ? "No inquiries yet."
            : `${inquiries.length} total · ${open.length} open`}
        </p>
      </div>

      {inquiries.length === 0 ? (
        <div
          style={{
            padding: "60px 20px",
            textAlign: "center",
            background: C.surface,
            border: `1px dashed ${C.borderSoft}`,
            borderRadius: 14,
          }}
        >
          <div style={{ fontSize: 32, marginBottom: 12 }}>📋</div>
          <div style={{ fontSize: 14, fontWeight: 600, color: C.ink, marginBottom: 4 }}>
            No inquiries yet
          </div>
          <p style={{ fontSize: 13, color: C.inkMuted, margin: "0 auto", maxWidth: 360, lineHeight: 1.5 }}>
            Browse the Discover tab to find talent and submit your first booking inquiry.
          </p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
          <InquiryTable rows={open}   label="Open" />
          <InquiryTable rows={closed} label="Closed" />
        </div>
      )}
    </div>
  );
}
