// Phase 3.3 — talent Today page.
// Shows the talent's pulse: active inquiries + upcoming bookings + stats.

import { notFound } from "next/navigation";
import Link from "next/link";
import { getTenantScopeBySlug } from "@/lib/saas/scope";
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

// ─── Stat tile ─────────────────────────────────────────────────────────────────

function StatTile({ label, value, sub, accent = false }: { label: string; value: string; sub?: string; accent?: boolean }) {
  return (
    <div
      style={{
        background: accent ? C.accentSoft : C.cardBg,
        border: `1px solid ${accent ? "rgba(15,79,62,0.24)" : C.borderSoft}`,
        borderRadius: 12,
        padding: "14px 16px",
        fontFamily: FONT,
      }}
    >
      <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: 0.6, textTransform: "uppercase" as const, color: C.inkMuted, marginBottom: 4 }}>
        {label}
      </div>
      <div
        style={{
          fontSize: 28,
          fontWeight: 600,
          color: accent ? C.accent : C.ink,
          letterSpacing: -0.5,
          lineHeight: 1,
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {value}
      </div>
      {sub && (
        <div style={{ fontSize: 11, color: C.inkMuted, marginTop: 4 }}>{sub}</div>
      )}
    </div>
  );
}

// ─── Inquiry row ──────────────────────────────────────────────────────────────

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
    participantStatus: string;
  };
  tenantSlug: string;
}) {
  const isActive = ["submitted", "coordination", "offer_pending", "approved"].includes(inquiry.status);
  const isBooked = inquiry.status === "booked" || inquiry.status === "converted";
  return (
    <Link
      href={`/${tenantSlug}/talent/inbox`}
      style={{
        display: "grid",
        gridTemplateColumns: "1fr auto",
        gap: 12,
        alignItems: "center",
        padding: "13px 16px",
        textDecoration: "none",
        borderBottom: `1px solid ${C.borderSoft}`,
        transition: "background 100ms",
        fontFamily: FONT,
      }}
      className="inq-row"
    >
      <div style={{ minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3 }}>
          <StatusChip status={inquiry.status} />
          {(isActive || isBooked) && (
            <span
              style={{
                width: 6,
                height: 6,
                borderRadius: "50%",
                background: isBooked ? C.successDeep : C.indigoDeep,
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
          {inquiry.contact_name}
          {inquiry.company && (
            <span style={{ color: C.inkMuted, fontWeight: 400, marginLeft: 6 }}>
              · {inquiry.company}
            </span>
          )}
        </div>
        {(inquiry.event_location || inquiry.event_date) && (
          <div style={{ fontSize: 11.5, color: C.inkMuted, marginTop: 2 }}>
            {[inquiry.event_location, fmtDate(inquiry.event_date)].filter(Boolean).join(" · ")}
          </div>
        )}
      </div>
      <div style={{ textAlign: "right", flexShrink: 0, fontSize: 11, color: C.inkDim }}>
        {relativeDate(inquiry.created_at)}
      </div>
    </Link>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function TalentTodayPage({ params }: { params: PageParams }) {
  const { tenantSlug } = await params;
  const session = await getCachedActorSession();
  if (!session.user) notFound();

  const scope = await getTenantScopeBySlug(tenantSlug);
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

  // Recent: show 5 most active inquiries, prioritizing active + pending
  const prioritized = [
    ...pendingInquiries,
    ...activeInquiries.filter((i) => !pendingInquiries.find((p) => p.id === i.id)),
    ...allInquiries.filter((i) => !activeInquiries.find((a) => a.id === i.id) && !pendingInquiries.find((p) => p.id === i.id)),
  ].slice(0, 8);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24, fontFamily: FONT }}>
      <style>{`.inq-row:hover { background: ${C.surfaceAlt}; }`}</style>

      {/* ── Header ── */}
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

      {/* ── Stat tiles ── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12 }}>
        <StatTile label="Active inquiries" value={activeInquiries.length.toString()} sub="in progress" />
        <StatTile label="Needs reply" value={pendingInquiries.length.toString()} sub={pendingInquiries.length > 0 ? "action required" : "you're up to date"} accent={pendingInquiries.length > 0} />
        <StatTile label="Booked" value={bookedInquiries.length.toString()} sub="confirmed jobs" />
        <StatTile label="Total" value={allInquiries.length.toString()} sub="all time" />
      </div>

      {/* ── Recent activity / inquiries list ── */}
      {prioritized.length > 0 ? (
        <section>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 12 }}>
            <h2 style={{ margin: 0, fontFamily: FONT, fontSize: 17, fontWeight: 600, color: C.ink, letterSpacing: -0.2 }}>
              Your inquiries
            </h2>
            <Link
              href={`/${tenantSlug}/talent/inbox`}
              style={{ fontSize: 12, color: C.indigoDeep, fontWeight: 600, textDecoration: "none", fontFamily: FONT }}
            >
              View all →
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
