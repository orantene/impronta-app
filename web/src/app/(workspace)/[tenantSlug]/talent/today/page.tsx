// Phase 3.3 — talent Today page.
// Shows the talent's pulse: active inquiries + upcoming bookings + stats.

import { notFound } from "next/navigation";
import Link from "next/link";
import { getTenantPortalScopeBySlug } from "@/lib/saas/scope";
import { getCachedActorSession } from "@/lib/server/request-cache";
import { loadTalentSelfProfile, loadTalentInquiries } from "../../_data-bridge";

export const dynamic = "force-dynamic";
type PageParams = Promise<{ tenantSlug: string }>;

const C = {
  ink:         "#0B0B0D",
  inkMuted:    "rgba(11,11,13,0.55)",
  inkDim:      "rgba(11,11,13,0.35)",
  border:      "rgba(24,24,27,0.08)",
  borderSoft:  "rgba(24,24,27,0.08)",
  cardBg:      "#ffffff",
  surface:     "rgba(11,11,13,0.02)",
  surfaceAlt:  "rgba(11,11,13,0.025)",
  accent:      "#0F4F3E",
  accentSoft:  "rgba(15,79,62,0.08)",
  fill:        "#0F4F3E",
  fillDeep:    "#0A3830",
  successDeep: "#1A7348",
  successSoft: "rgba(26,115,72,0.10)",
  amberDeep:   "#8A6F1A",
  amberSoft:   "rgba(138,111,26,0.10)",
  indigoDeep:  "#2B3FA3",
  indigoSoft:  "rgba(43,63,163,0.07)",
} as const;

const FONT = '"Inter", system-ui, sans-serif';

// ─── Status tone ───────────────────────────────────────────────────────────────

function statusTone(status: string): { bg: string; color: string; label: string } {
  const map: Record<string, { bg: string; color: string; label: string }> = {
    booked:        { bg: C.successSoft, color: C.successDeep, label: "Booked" },
    converted:     { bg: C.successSoft, color: C.successDeep, label: "Booked" },
    approved:      { bg: C.accentSoft,  color: C.accent,      label: "Approved" },
    offer_pending: { bg: C.amberSoft,   color: C.amberDeep,   label: "Offer pending" },
    submitted:     { bg: C.indigoSoft,  color: C.indigoDeep,  label: "Submitted" },
    coordination:  { bg: C.indigoSoft,  color: C.indigoDeep,  label: "In review" },
    rejected:      { bg: C.surfaceAlt,  color: C.inkDim,      label: "Rejected" },
    expired:       { bg: C.surfaceAlt,  color: C.inkDim,      label: "Expired" },
    draft:         { bg: C.surfaceAlt,  color: C.inkDim,      label: "Draft" },
  };
  return map[status] ?? { bg: C.surfaceAlt, color: C.inkDim, label: status.replace(/_/g, " ") };
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

// ─── Horizontal stats strip (matching prototype) ──────────────────────────────

function StatStrip({ cells }: {
  cells: Array<{ label: string; value: string; sub?: string; subAccent?: boolean }>;
}) {
  return (
    <div
      style={{
        background: C.cardBg,
        border: `1px solid ${C.borderSoft}`,
        borderRadius: 14,
        display: "grid",
        gridTemplateColumns: `repeat(${cells.length}, 1fr)`,
        fontFamily: FONT,
        overflow: "hidden",
      }}
    >
      {cells.map((cell, i) => (
        <div
          key={cell.label}
          style={{
            padding: "14px 20px",
            borderLeft: i > 0 ? `1px solid ${C.borderSoft}` : "none",
          }}
        >
          <div style={{ fontSize: 11, fontWeight: 600, color: C.inkMuted, letterSpacing: 0.1, marginBottom: 4 }}>
            {cell.label}
          </div>
          <div style={{ fontSize: 24, fontWeight: 600, color: C.ink, letterSpacing: -0.4, lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>
            {cell.value}
          </div>
          {cell.sub && (
            <div style={{ fontSize: 11.5, color: cell.subAccent ? C.successDeep : C.inkMuted, marginTop: 3 }}>
              {cell.sub}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ─── Inquiry row ──────────────────────────────────────────────────────────────

function participantStatusLabel(participantStatus: string, inquiryStatus: string): string {
  if (participantStatus === "declined") return "You declined";
  if (participantStatus === "invited") {
    if (["offer_pending"].includes(inquiryStatus)) return "Review offer";
    return "Awaiting your response";
  }
  if (participantStatus === "pending") return "Pending confirmation";
  // accepted
  if (["booked", "converted"].includes(inquiryStatus)) return "Confirmed";
  if (inquiryStatus === "approved") return "Approved";
  if (inquiryStatus === "offer_pending") return "Review offer";
  if (["submitted", "coordination"].includes(inquiryStatus)) return "Agency coordinating";
  return "";
}

// Client initial avatar (matches prototype's circular letter avatar)
function ClientAvatar({ name }: { name: string }) {
  const initials = name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
  // Deterministic pastel background from first char code
  const hue = ((name.charCodeAt(0) ?? 65) * 137) % 360;
  return (
    <div
      aria-hidden
      style={{
        width: 34,
        height: 34,
        borderRadius: "50%",
        background: `hsl(${hue}, 28%, 88%)`,
        color: `hsl(${hue}, 40%, 32%)`,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: 12,
        fontWeight: 700,
        flexShrink: 0,
        fontFamily: FONT,
        letterSpacing: 0.2,
        userSelect: "none",
      }}
    >
      {initials || "?"}
    </div>
  );
}

function InquiryRow({
  inquiry,
  tenantSlug,
}: {
  inquiry: {
    id: string;
    status: string;
    contact_name: string;
    company: string | null;
    event_date: string | null;
    event_location: string | null;
    created_at: string;
    updated_at: string;
    participantStatus: string;
  };
  tenantSlug: string;
}) {
  const needsAction = inquiry.participantStatus === "invited" || inquiry.status === "offer_pending";
  const isHold = inquiry.participantStatus === "pending" && inquiry.status !== "booked";
  const activityAt = inquiry.updated_at ?? inquiry.created_at;
  const isLate = (() => {
    try { return Date.now() - new Date(activityAt).getTime() > 12 * 60 * 60 * 1000; } catch { return false; }
  })();

  // Badge label: "Offer" or "Hold" matching prototype
  const badgeLabel = isHold ? "Hold" : "Offer";
  const badgeBg = isHold ? "rgba(138,111,26,0.12)" : "rgba(15,79,62,0.10)";
  const badgeColor = isHold ? C.amberDeep : C.accent;

  // Date sub-line: formatted event date or "—"
  const dateLabel = inquiry.event_date
    ? new Date(inquiry.event_date).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })
    : "—";

  return (
    <Link
      href={`/${tenantSlug}/talent/inbox/${inquiry.id}`}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "12px 16px",
        textDecoration: "none",
        borderBottom: `1px solid ${C.borderSoft}`,
        transition: "background 100ms",
        fontFamily: FONT,
        background: needsAction ? "rgba(15,79,62,0.025)" : "transparent",
      }}
      className="inq-row"
    >
      {/* Company avatar */}
      <ClientAvatar name={inquiry.contact_name} />

      {/* Main content */}
      <div style={{ flex: 1, minWidth: 0 }}>
        {/* Top line: company · job description */}
        <div
          style={{
            fontSize: 13,
            fontWeight: 600,
            color: C.ink,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            marginBottom: 3,
          }}
        >
          {inquiry.contact_name}
          {inquiry.company && (
            <span style={{ color: C.inkMuted, fontWeight: 400 }}> · {inquiry.company}</span>
          )}
        </div>
        {/* Bottom line: badge + date + location */}
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              padding: "1px 7px",
              borderRadius: 5,
              background: badgeBg,
              color: badgeColor,
              fontSize: 10.5,
              fontWeight: 700,
              fontFamily: FONT,
              letterSpacing: 0.1,
            }}
          >
            {badgeLabel}
          </span>
          <span style={{ fontSize: 11.5, color: C.inkMuted }}>
            {dateLabel}
          </span>
          {inquiry.event_location && (
            <span style={{ fontSize: 11.5, color: C.inkDim }}>
              · {inquiry.event_location}
            </span>
          )}
        </div>
      </div>

      {/* Time ago */}
      <div style={{ flexShrink: 0, fontSize: 11, color: isLate ? "#B04A22" : C.inkDim, textAlign: "right" }}>
        {relativeDate(activityAt)}
      </div>

      {/* Chevron */}
      <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden style={{ flexShrink: 0, color: C.inkDim }}>
        <path d="M6 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    </Link>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function TalentTodayPage({ params }: { params: PageParams }) {
  const { tenantSlug } = await params;
  const session = await getCachedActorSession();
  if (!session.user) notFound();

  const scope = await getTenantPortalScopeBySlug(tenantSlug);
  if (!scope) notFound();

  const talentProfile = await loadTalentSelfProfile(session.user.id, scope.tenantId);
  if (!talentProfile) notFound();

  const allInquiries = await loadTalentInquiries(talentProfile.id, scope.tenantId);

  const firstName = talentProfile.displayName.split(" ")[0] ?? talentProfile.displayName;

  // Derive key stats
  const activeInquiries  = allInquiries.filter((i) => ["submitted", "coordination", "offer_pending", "approved"].includes(i.status));
  const bookedInquiries  = allInquiries.filter((i) => i.status === "booked" || i.status === "converted");
  const pendingInquiries = allInquiries.filter((i) => i.participantStatus === "pending" || i.status === "offer_pending");

  // Hero headline — context-aware
  let headline: string;
  let subline: string;
  if (allInquiries.length === 0) {
    headline = `Welcome to Tulala, ${firstName}.`;
    subline = "You're rostered and ready. First inquiries will appear here once the agency pitches you.";
  } else if (pendingInquiries.length > 0) {
    headline = `${pendingInquiries.length === 1 ? "1 thing needs" : `${pendingInquiries.length} things need`} your reply.`;
    subline = "Check your inbox to respond to open offers.";
  } else if (activeInquiries.length > 0) {
    headline = `${activeInquiries.length} active ${activeInquiries.length === 1 ? "inquiry" : "inquiries"} in progress.`;
    subline = "Your agency is coordinating — you'll hear more soon.";
  } else {
    headline = `Hi ${firstName} — nothing urgent right now.`;
    subline = bookedInquiries.length > 0
      ? `${bookedInquiries.length} confirmed booking${bookedInquiries.length > 1 ? "s" : ""} on your calendar.`
      : "Check back later or browse your full inquiry history.";
  }

  // Recent: show 8 most active inquiries, prioritizing active + pending
  const prioritized = [
    ...pendingInquiries,
    ...activeInquiries.filter((i) => !pendingInquiries.find((p) => p.id === i.id)),
    ...allInquiries.filter((i) => !activeInquiries.find((a) => a.id === i.id) && !pendingInquiries.find((p) => p.id === i.id)),
  ].slice(0, 8);

  // Upcoming confirmed bookings (future dates only), sorted by event_date asc
  const today = new Date().toISOString().slice(0, 10);
  const upcomingBookings = bookedInquiries
    .filter((i) => i.event_date && i.event_date >= today)
    .sort((a, b) => (a.event_date ?? "").localeCompare(b.event_date ?? ""))
    .slice(0, 5);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24, fontFamily: FONT }}>
      <style>{`.inq-row:hover { background: ${C.surfaceAlt}; }`}</style>

      {/* ── Header ── */}
      <div>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <div>
            <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: 0.7, textTransform: "uppercase", color: C.accent, marginBottom: 4 }}>
              {talentProfile.agencyName}
            </div>
            <h1 style={{ fontFamily: FONT, fontSize: 26, fontWeight: 700, color: C.ink, margin: 0, letterSpacing: -0.5, lineHeight: 1.1 }}>
              {headline}
            </h1>
            <p style={{ fontFamily: FONT, fontSize: 13, color: C.inkMuted, margin: "6px 0 0", lineHeight: 1.5 }}>
              {subline}
            </p>
          </div>
          {pendingInquiries.length > 0 && (
            <Link
              href={`/${tenantSlug}/talent/inbox`}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                height: 36,
                padding: "0 16px",
                borderRadius: 8,
                background: C.fill,
                color: "#fff",
                fontSize: 13,
                fontWeight: 600,
                textDecoration: "none",
                fontFamily: FONT,
                flexShrink: 0,
              }}
            >
              Reply now →
            </Link>
          )}
        </div>
        {/* Location + calendar quick access */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 10, flexWrap: "wrap" }}>
          {talentProfile.homeCity && (
            <span style={{ fontSize: 12, color: C.inkMuted, fontFamily: FONT }}>
              📍 {talentProfile.homeCity}
            </span>
          )}
          {talentProfile.primaryTypeLabel && (
            <span style={{ fontSize: 12, color: C.inkMuted, fontFamily: FONT }}>
              · {talentProfile.primaryTypeLabel}
            </span>
          )}
          <Link
            href={`/${tenantSlug}/talent/calendar`}
            style={{ fontSize: 12, color: C.indigoDeep, fontWeight: 600, textDecoration: "none", fontFamily: FONT, marginLeft: "auto" }}
          >
            Open calendar →
          </Link>
        </div>
      </div>

      {/* ── Stats strip (prototype-matching horizontal 3-col) ── */}
      {(() => {
        // Next upcoming booking date
        const nextBooking = upcomingBookings[0];
        const nextLabel = nextBooking?.event_date
          ? new Date(nextBooking.event_date).toLocaleDateString("en-GB", { day: "numeric", month: "short" })
          : null;
        const profileStatus = talentProfile.workflowStatus === "published" ? "Live" : "Draft";

        return (
          <StatStrip
            cells={[
              {
                label: "Confirmed",
                value: bookedInquiries.length.toString(),
                sub: nextLabel ? `next ${nextLabel}` : "no upcoming bookings",
              },
              {
                label: "Needs reply",
                value: pendingInquiries.length.toString(),
                sub: pendingInquiries.length > 0 ? "action required" : "you're up to date",
                subAccent: pendingInquiries.length > 0,
              },
              {
                label: "Profile",
                value: profileStatus,
                sub: talentProfile.primaryTypeLabel ?? undefined,
              },
            ]}
          />
        );
      })()}

      {/* ── Next on the calendar ── */}
      {upcomingBookings.length > 0 && (
        <section>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 10 }}>
            <div>
              <h2 style={{ margin: 0, fontFamily: FONT, fontSize: 17, fontWeight: 600, color: C.ink, letterSpacing: -0.2 }}>
                Next on the calendar
              </h2>
              <p style={{ margin: "2px 0 0", fontFamily: FONT, fontSize: 12, color: C.inkMuted }}>
                {upcomingBookings.length} upcoming · next{" "}
                {upcomingBookings[0]?.event_date
                  ? new Date(upcomingBookings[0].event_date).toLocaleDateString("en-GB", { day: "numeric", month: "short" })
                  : "soon"}
              </p>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <Link
                href={`/${tenantSlug}/talent/calendar`}
                style={{ fontSize: 12, color: C.inkMuted, fontWeight: 500, textDecoration: "none", fontFamily: FONT }}
              >
                + Add manually
              </Link>
              <Link
                href={`/${tenantSlug}/talent/calendar`}
                style={{ fontSize: 12, color: C.indigoDeep, fontWeight: 600, textDecoration: "none", fontFamily: FONT }}
              >
                See calendar →
              </Link>
            </div>
          </div>
          <div
            style={{
              background: C.cardBg,
              border: `1px solid ${C.borderSoft}`,
              borderRadius: 14,
              overflow: "hidden",
            }}
          >
            {upcomingBookings.map((bk, i) => {
              const d = bk.event_date ? new Date(bk.event_date) : null;
              const month = d ? d.toLocaleDateString("en-GB", { month: "short" }) : null;
              const day = d ? d.getDate() : null;
              return (
                <Link
                  key={bk.id}
                  href={`/${tenantSlug}/talent/inbox/${bk.id}`}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 14,
                    padding: "12px 16px",
                    borderTop: i > 0 ? `1px solid ${C.borderSoft}` : "none",
                    textDecoration: "none",
                    fontFamily: FONT,
                  }}
                >
                  {/* Date badge */}
                  <div style={{ flexShrink: 0, width: 40, textAlign: "center" }}>
                    {month && day ? (
                      <>
                        <div style={{ fontSize: 9.5, fontWeight: 600, letterSpacing: 0.4, textTransform: "uppercase" as const, color: C.inkDim, lineHeight: 1 }}>
                          {month}
                        </div>
                        <div style={{ fontSize: 18, fontWeight: 700, color: C.successDeep, lineHeight: 1.2, fontVariantNumeric: "tabular-nums" }}>
                          {day}
                        </div>
                      </>
                    ) : (
                      <span style={{ fontSize: 10, color: C.inkDim }}>TBD</span>
                    )}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: C.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {bk.contact_name}
                      {bk.company && (
                        <span style={{ fontWeight: 400, color: C.inkMuted, marginLeft: 6 }}>· {bk.company}</span>
                      )}
                    </div>
                    {bk.event_location && (
                      <div style={{ fontSize: 11.5, color: C.inkMuted, marginTop: 1 }}>{bk.event_location}</div>
                    )}
                  </div>
                  <StatusChip status={bk.status} />
                </Link>
              );
            })}
          </div>
        </section>
      )}

      {/* ── Recent activity / inquiries list ── */}
      {prioritized.length > 0 ? (
        <section>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 8 }}>
            <div>
              <h2 style={{ margin: 0, fontFamily: FONT, fontSize: 17, fontWeight: 600, color: C.ink, letterSpacing: -0.2 }}>
                {pendingInquiries.length > 0 ? "Needs your reply" : "Your inquiries"}
              </h2>
              {pendingInquiries.length > 0 && (
                <p style={{ margin: "2px 0 0", fontFamily: FONT, fontSize: 12, color: C.inkMuted }}>
                  {pendingInquiries.filter((i) => i.status === "offer_pending").length} offers
                  {" · "}{pendingInquiries.filter((i) => i.participantStatus === "pending" && i.status !== "offer_pending").length} holds
                </p>
              )}
            </div>
            <Link
              href={`/${tenantSlug}/talent/inbox`}
              style={{ fontSize: 12, color: C.indigoDeep, fontWeight: 600, textDecoration: "none", fontFamily: FONT }}
            >
              Open inbox →
            </Link>
          </div>

          <div
            style={{
              background: C.cardBg,
              border: `1px solid ${C.borderSoft}`,
              borderRadius: 14,
              overflow: "hidden",
            }}
          >
            {prioritized.map((inq) => (
              <InquiryRow key={inq.id} inquiry={inq} tenantSlug={tenantSlug} />
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
          <div style={{ fontSize: 32, marginBottom: 12 }}>📭</div>
          <div style={{ fontSize: 14, fontWeight: 600, color: C.ink, marginBottom: 4 }}>No inquiries yet</div>
          <p style={{ fontSize: 13, color: C.inkMuted, margin: "0 auto", maxWidth: 360, lineHeight: 1.5 }}>
            Your agency will add you to jobs as they come in. Make sure your profile is complete so they can pitch you effectively.
          </p>
          <Link
            href={`/${tenantSlug}/talent/profile`}
            style={{
              display: "inline-flex",
              marginTop: 16,
              height: 36,
              padding: "0 16px",
              borderRadius: 8,
              background: C.fill,
              color: "#fff",
              fontSize: 13,
              fontWeight: 600,
              textDecoration: "none",
              alignItems: "center",
              fontFamily: FONT,
            }}
          >
            Complete profile
          </Link>
        </div>
      )}

      {/* ── Status card — profile + roster ── */}
      <section
        style={{
          background: C.cardBg,
          border: `1px solid ${C.borderSoft}`,
          borderRadius: 14,
          padding: "16px 20px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 16,
          flexWrap: "wrap",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          {/* Profile status */}
          <div>
            <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: 0.6, textTransform: "uppercase" as const, color: C.inkDim, marginBottom: 2 }}>
              Profile
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span
                style={{
                  width: 7,
                  height: 7,
                  borderRadius: "50%",
                  background: talentProfile.workflowStatus === "published" ? C.successDeep : C.amberDeep,
                  flexShrink: 0,
                }}
              />
              <span style={{ fontSize: 13, fontWeight: 600, color: C.ink, textTransform: "capitalize" as const }}>
                {talentProfile.workflowStatus === "published" ? "Live" : talentProfile.workflowStatus}
              </span>
            </div>
          </div>

          <div style={{ width: 1, height: 28, background: C.borderSoft }} />

          {/* Roster status */}
          <div>
            <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: 0.6, textTransform: "uppercase" as const, color: C.inkDim, marginBottom: 2 }}>
              Roster
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span
                style={{
                  width: 7,
                  height: 7,
                  borderRadius: "50%",
                  background: talentProfile.rosterStatus === "active" ? C.successDeep : C.amberDeep,
                  flexShrink: 0,
                }}
              />
              <span style={{ fontSize: 13, fontWeight: 600, color: C.ink, textTransform: "capitalize" as const }}>
                {talentProfile.rosterStatus === "active" ? "Active" : talentProfile.rosterStatus}
              </span>
            </div>
          </div>

          {talentProfile.homeCity && (
            <>
              <div style={{ width: 1, height: 28, background: C.borderSoft }} />
              <div>
                <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: 0.6, textTransform: "uppercase" as const, color: C.inkDim, marginBottom: 2 }}>
                  Location
                </div>
                <div style={{ fontSize: 13, fontWeight: 500, color: C.ink }}>{talentProfile.homeCity}</div>
              </div>
            </>
          )}
        </div>

        <div style={{ display: "flex", gap: 8 }}>
          <Link
            href={`/${tenantSlug}/talent/profile`}
            style={{
              display: "inline-flex",
              alignItems: "center",
              height: 32,
              padding: "0 14px",
              borderRadius: 8,
              border: `1px solid ${C.borderSoft}`,
              background: C.cardBg,
              color: C.ink,
              fontSize: 12.5,
              fontWeight: 600,
              textDecoration: "none",
              fontFamily: FONT,
            }}
          >
            View profile →
          </Link>
        </div>
      </section>
    </div>
  );
}
