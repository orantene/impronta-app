// Phase 3.10 — Client Today page.
// Shows the client's pulse: active inquiries + upcoming bookings + quick stats.

import { notFound } from "next/navigation";
import Link from "next/link";
import { getTenantScopeBySlug } from "@/lib/saas/scope";
import { getCachedActorSession } from "@/lib/server/request-cache";
import { loadClientSelfProfile, loadClientInquiries } from "../../_data-bridge";

export const dynamic = "force-dynamic";
type PageParams = Promise<{ tenantSlug: string }>;

const C = {
  ink:          "#0B0B0D",
  inkMuted:     "rgba(11,11,13,0.55)",
  inkDim:       "rgba(11,11,13,0.35)",
  border:       "rgba(24,24,27,0.08)",
  borderSoft:   "rgba(24,24,27,0.08)",
  cardBg:       "#ffffff",
  surface:      "rgba(11,11,13,0.02)",
  surfaceAlt:   "rgba(11,11,13,0.025)",
  accent:       "#1D4ED8",
  accentSoft:   "rgba(29,78,216,0.08)",
  blue:         "#2563EB",
  blueSoft:     "rgba(37,99,235,0.08)",
  blueDeep:     "#1D4ED8",
  successDeep:  "#1A7348",
  successSoft:  "rgba(26,115,72,0.10)",
  amberDeep:    "#8A6F1A",
  amberSoft:    "rgba(138,111,26,0.10)",
} as const;

const FONT = '"Inter", system-ui, sans-serif';

function statusTone(status: string): { bg: string; color: string; label: string } {
  const map: Record<string, { bg: string; color: string; label: string }> = {
    booked:        { bg: C.successSoft,  color: C.successDeep, label: "Booked" },
    converted:     { bg: C.successSoft,  color: C.successDeep, label: "Booked" },
    approved:      { bg: C.accentSoft,   color: C.accent,      label: "Approved" },
    offer_pending: { bg: C.amberSoft,    color: C.amberDeep,   label: "Offer pending" },
    submitted:     { bg: C.blueSoft,     color: C.blueDeep,    label: "Submitted" },
    coordination:  { bg: C.blueSoft,     color: C.blueDeep,    label: "In review" },
    rejected:      { bg: C.surface,      color: C.inkDim,      label: "Declined" },
    expired:       { bg: C.surface,      color: C.inkDim,      label: "Expired" },
    draft:         { bg: C.surface,      color: C.inkDim,      label: "Draft" },
  };
  return map[status] ?? { bg: C.surface, color: C.inkDim, label: status.replace(/_/g, " ") };
}

function StatusChip({ status }: { status: string }) {
  const s = statusTone(status);
  return (
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
        flexShrink: 0,
        fontFamily: FONT,
        textWrap: "nowrap",
      }}
    >
      {s.label}
    </span>
  );
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

function StatTile({ label, value, sub, accent = false }: { label: string; value: string; sub?: string; accent?: boolean }) {
  return (
    <div
      style={{
        background: accent ? C.accentSoft : C.cardBg,
        border: `1px solid ${accent ? "rgba(29,78,216,0.20)" : C.borderSoft}`,
        borderRadius: 12,
        padding: "14px 16px",
        fontFamily: FONT,
      }}
    >
      <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: 0.6, textTransform: "uppercase" as const, color: C.inkMuted, marginBottom: 4 }}>
        {label}
      </div>
      <div style={{ fontSize: 28, fontWeight: 600, color: accent ? C.accent : C.ink, letterSpacing: -0.5, lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>
        {value}
      </div>
      {sub && <div style={{ fontSize: 11, color: C.inkMuted, marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

export default async function ClientTodayPage({ params }: { params: PageParams }) {
  const { tenantSlug } = await params;
  const session = await getCachedActorSession();
  if (!session.user) notFound();

  const scope = await getTenantScopeBySlug(tenantSlug);
  if (!scope) notFound();

  const clientProfile = await loadClientSelfProfile(session.user.id, scope.tenantId);
  if (!clientProfile) notFound();

  const allInquiries = await loadClientInquiries(session.user.id, scope.tenantId);

  const firstName = clientProfile.displayName.split(" ")[0] ?? clientProfile.displayName;

  const activeInquiries  = allInquiries.filter((i) =>
    ["submitted", "coordination", "offer_pending", "approved"].includes(i.status),
  );
  const bookedInquiries  = allInquiries.filter((i) =>
    i.status === "booked" || i.status === "converted",
  );
  const actionRequired   = allInquiries.filter((i) =>
    i.next_action_by === "client" || i.status === "offer_pending",
  );

  // Context-aware headline
  let headline: string;
  let subline: string;
  if (allInquiries.length === 0) {
    headline = `Welcome, ${firstName}.`;
    subline = `You're all set. Submit your first booking enquiry from the Discover tab.`;
  } else if (actionRequired.length > 0) {
    headline = `${actionRequired.length === 1 ? "1 inquiry needs" : `${actionRequired.length} inquiries need`} your attention.`;
    subline = "Check your Inquiries tab to respond.";
  } else if (activeInquiries.length > 0) {
    headline = `${activeInquiries.length} active ${activeInquiries.length === 1 ? "inquiry" : "inquiries"} in progress.`;
    subline = `${clientProfile.agencyName} is coordinating — you'll hear back soon.`;
  } else {
    headline = `Hi ${firstName} — nothing urgent right now.`;
    subline = bookedInquiries.length > 0
      ? `${bookedInquiries.length} confirmed booking${bookedInquiries.length > 1 ? "s" : ""} on your record.`
      : "Browse the roster to discover talent and submit a new inquiry.";
  }

  // Top 6 inquiries: prioritize action-required, then active, then rest
  const prioritized = [
    ...actionRequired,
    ...activeInquiries.filter((i) => !actionRequired.find((a) => a.id === i.id)),
    ...allInquiries.filter((i) =>
      !activeInquiries.find((a) => a.id === i.id) && !actionRequired.find((a) => a.id === i.id),
    ),
  ].slice(0, 6);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24, fontFamily: FONT }}>
      <style>{`.client-inq-row:hover { background: ${C.surfaceAlt}; }`}</style>

      {/* Header */}
      <div>
        <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: 0.7, textTransform: "uppercase", color: C.accent, marginBottom: 4 }}>
          {clientProfile.agencyName}
        </div>
        <h1 style={{ fontFamily: FONT, fontSize: 26, fontWeight: 700, color: C.ink, margin: 0, letterSpacing: -0.5, lineHeight: 1.1 }}>
          {headline}
        </h1>
        <p style={{ fontFamily: FONT, fontSize: 13, color: C.inkMuted, margin: "6px 0 0", lineHeight: 1.5 }}>
          {subline}
        </p>
      </div>

      {/* Stat tiles */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12 }}>
        <StatTile label="Active" value={activeInquiries.length.toString()} sub="in progress" />
        <StatTile
          label="Action needed"
          value={actionRequired.length.toString()}
          sub={actionRequired.length > 0 ? "awaiting your reply" : "you're up to date"}
          accent={actionRequired.length > 0}
        />
        <StatTile label="Booked" value={bookedInquiries.length.toString()} sub="confirmed jobs" />
        <StatTile label="Total" value={allInquiries.length.toString()} sub="all time" />
      </div>

      {/* Recent inquiries */}
      {prioritized.length > 0 ? (
        <section>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 12 }}>
            <h2 style={{ margin: 0, fontFamily: FONT, fontSize: 17, fontWeight: 600, color: C.ink, letterSpacing: -0.2 }}>
              Your inquiries
            </h2>
            <Link href={`/${tenantSlug}/client/inquiries`} style={{ fontSize: 12, color: C.blueDeep, fontWeight: 600, textDecoration: "none", fontFamily: FONT }}>
              View all →
            </Link>
          </div>

          <div style={{ background: C.cardBg, border: `1px solid ${C.borderSoft}`, borderRadius: 14, overflow: "hidden" }}>
            {prioritized.map((inq) => (
              <div
                key={inq.id}
                className="client-inq-row"
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr auto",
                  gap: 12,
                  alignItems: "center",
                  padding: "13px 16px",
                  borderBottom: `1px solid ${C.borderSoft}`,
                  fontFamily: FONT,
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3 }}>
                    <StatusChip status={inq.status} />
                    {inq.next_action_by === "client" && (
                      <span
                        style={{
                          width: 6,
                          height: 6,
                          borderRadius: "50%",
                          background: C.blueDeep,
                          flexShrink: 0,
                        }}
                      />
                    )}
                  </div>
                  <div
                    style={{
                      fontSize: 13.5,
                      fontWeight: 600,
                      color: C.ink,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {inq.company ?? "Booking inquiry"}
                    {inq.event_location && (
                      <span style={{ color: C.inkMuted, fontWeight: 400, marginLeft: 6 }}>
                        · {inq.event_location}
                      </span>
                    )}
                  </div>
                  {inq.event_date && (
                    <div style={{ fontSize: 11.5, color: C.inkMuted, marginTop: 2 }}>
                      {fmtDate(inq.event_date)}
                      {inq.quantity && ` · ${inq.quantity} talent`}
                    </div>
                  )}
                </div>
                <div style={{ textAlign: "right", flexShrink: 0, fontSize: 11, color: C.inkDim }}>
                  {relativeDate(inq.created_at)}
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : (
        <div
          style={{
            padding: "40px 20px",
            textAlign: "center",
            background: C.surface,
            border: `1px dashed ${C.border}`,
            borderRadius: 14,
          }}
        >
          <div style={{ fontSize: 32, marginBottom: 12 }}>📋</div>
          <div style={{ fontSize: 14, fontWeight: 600, color: C.ink, marginBottom: 4 }}>No inquiries yet</div>
          <p style={{ fontSize: 13, color: C.inkMuted, margin: "0 auto", maxWidth: 360, lineHeight: 1.5 }}>
            Browse the talent roster to discover talent and submit your first booking enquiry.
          </p>
          <Link
            href={`/${tenantSlug}/client/discover`}
            style={{
              display: "inline-flex",
              marginTop: 16,
              height: 36,
              padding: "0 16px",
              borderRadius: 8,
              background: C.accent,
              color: "#fff",
              fontSize: 13,
              fontWeight: 600,
              textDecoration: "none",
              alignItems: "center",
              fontFamily: FONT,
            }}
          >
            Discover talent →
          </Link>
        </div>
      )}
    </div>
  );
}
