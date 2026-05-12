// Phase 3.10 — Client Today page.
// Shows the client's pulse: active inquiries + upcoming bookings + quick stats.

import { notFound } from "next/navigation";
import Link from "next/link";
import { getTenantPortalScopeBySlug } from "@/lib/saas/scope";
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

  const scope = await getTenantPortalScopeBySlug(tenantSlug);
  if (!scope) notFound();

  const clientProfile = await loadClientSelfProfile(session.user.id, scope.tenantId);
  if (!clientProfile) notFound();

  const allInquiries = await loadClientInquiries(session.user.id, scope.tenantId);

  const firstName = clientProfile.displayName.split(" ")[0] ?? clientProfile.displayName;

  // Three buckets matching the prototype
  const needsDecision  = allInquiries.filter((i) =>
    i.next_action_by === "client" || i.status === "offer_pending",
  );
  const agencyHasIt    = allInquiries.filter((i) =>
    !["booked", "converted"].includes(i.status) &&
    i.next_action_by !== "client" &&
    i.status !== "offer_pending" &&
    !["declined", "cancelled", "expired"].includes(i.status),
  );
  const confirmed      = allInquiries.filter((i) =>
    ["booked", "converted"].includes(i.status),
  );

  // For stats
  const activeCount    = allInquiries.filter((i) =>
    ["submitted", "coordination", "offer_pending", "approved"].includes(i.status),
  ).length;

  // Context-aware headline
  let headline: string;
  let subline: string;
  if (allInquiries.length === 0) {
    headline = `Welcome, ${firstName}.`;
    subline = "You're all set. Send a booking inquiry when you have a brief ready.";
  } else if (needsDecision.length > 0) {
    headline = `${needsDecision.length === 1 ? "1 inquiry needs" : `${needsDecision.length} inquiries need`} your attention.`;
    subline = "Review and respond to keep the process moving.";
  } else if (agencyHasIt.length > 0) {
    headline = `${agencyHasIt.length} active ${agencyHasIt.length === 1 ? "inquiry" : "inquiries"} in progress.`;
    subline = `${clientProfile.agencyName} is coordinating — you'll hear back soon.`;
  } else {
    headline = `Hi ${firstName} — nothing urgent right now.`;
    subline = confirmed.length > 0
      ? `${confirmed.length} confirmed booking${confirmed.length > 1 ? "s" : ""} on your record.`
      : "Browse the roster or send a new inquiry when you have a brief ready.";
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24, fontFamily: FONT }}>
      <style>{`.client-inq-row:hover { background: ${C.surfaceAlt}; }`}</style>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
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
        <Link
          href={`/${tenantSlug}/client/inquiries/new`}
          style={{
            display: "inline-flex",
            alignItems: "center",
            height: 34,
            padding: "0 14px",
            borderRadius: 8,
            background: C.accent,
            color: "#fff",
            fontSize: 12.5,
            fontWeight: 600,
            textDecoration: "none",
            flexShrink: 0,
            fontFamily: FONT,
          }}
        >
          + New inquiry
        </Link>
      </div>

      {/* Stat tiles */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 12 }}>
        <StatTile label="Active" value={activeCount.toString()} sub="in progress" />
        <StatTile
          label="Needs your reply"
          value={needsDecision.length.toString()}
          sub={needsDecision.length > 0 ? "awaiting your decision" : "you're up to date"}
          accent={needsDecision.length > 0}
        />
        <StatTile label="Confirmed" value={confirmed.length.toString()} sub="confirmed bookings" />
        <StatTile label="Total" value={allInquiries.length.toString()} sub="all time" />
      </div>

      {allInquiries.length === 0 ? (
        /* Empty state */
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
            Send your first booking inquiry now, or browse the roster first if you want to pick a specific talent.
          </p>
          <div style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap", marginTop: 16 }}>
            <Link
              href={`/${tenantSlug}/client/inquiries/new`}
              style={{
                display: "inline-flex",
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
              Start inquiry →
            </Link>
            <Link
              href={`/${tenantSlug}/client/discover`}
              style={{
                display: "inline-flex",
                height: 36,
                padding: "0 16px",
                borderRadius: 8,
                background: "#fff",
                border: `1px solid ${C.borderSoft}`,
                color: C.ink,
                fontSize: 13,
                fontWeight: 600,
                textDecoration: "none",
                alignItems: "center",
                fontFamily: FONT,
              }}
            >
              Browse roster
            </Link>
          </div>
        </div>
      ) : (
        /* Three-bucket layout */
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>

          {/* Bucket 1 — Needs your decision */}
          {needsDecision.length > 0 && (
            <BucketSection
              title="Needs your decision"
              description="The agency has sent something — review and respond to keep things moving."
              accentBar="#1D4ED8"
              items={needsDecision}
              tenantSlug={tenantSlug}
            />
          )}

          {/* Bucket 2 — Agency has it */}
          {agencyHasIt.length > 0 && (
            <BucketSection
              title="Agency is coordinating"
              description="These are in progress — no action from you right now."
              items={agencyHasIt}
              tenantSlug={tenantSlug}
            />
          )}

          {/* Bucket 3 — Confirmed */}
          {confirmed.length > 0 && (
            <BucketSection
              title="Coming up"
              description="Confirmed and fully booked events."
              accentBar="#1A7348"
              items={confirmed}
              tenantSlug={tenantSlug}
            />
          )}

          <div style={{ textAlign: "center", paddingTop: 4 }}>
            <Link href={`/${tenantSlug}/client/inquiries`} style={{ fontSize: 12.5, color: C.blueDeep, fontWeight: 600, textDecoration: "none", fontFamily: FONT }}>
              View all inquiries →
            </Link>
          </div>
        </div>
      )}

      {/* Sticky bottom action bar */}
      <div
        style={{
          position: "sticky",
          bottom: 20,
          display: "flex",
          justifyContent: "center",
          gap: 10,
          pointerEvents: "none",
        }}
      >
        <Link
          href={`/${tenantSlug}/client/inquiries`}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            height: 40,
            padding: "0 18px",
            borderRadius: 999,
            background: "#fff",
            border: "1px solid rgba(24,24,27,0.12)",
            boxShadow: "0 4px 16px rgba(11,11,13,0.10)",
            color: C.ink,
            fontFamily: FONT,
            fontSize: 13,
            fontWeight: 600,
            textDecoration: "none",
            pointerEvents: "all",
          }}
        >
          My inquiries
        </Link>
        <Link
          href={`/${tenantSlug}/client/inquiries/new`}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            height: 40,
            padding: "0 18px",
            borderRadius: 999,
            background: C.accent,
            color: "#fff",
            fontFamily: FONT,
            fontSize: 13,
            fontWeight: 600,
            textDecoration: "none",
            boxShadow: "0 4px 16px rgba(29,78,216,0.25)",
            pointerEvents: "all",
          }}
        >
          + New inquiry
        </Link>
      </div>
    </div>
  );
}

type ClientInquiry = Awaited<ReturnType<typeof loadClientInquiries>>[number];

function BucketSection({
  title,
  description,
  accentBar,
  items,
  tenantSlug,
}: {
  title: string;
  description: string;
  accentBar?: string;
  items: ClientInquiry[];
  tenantSlug: string;
}) {
  const C2 = {
    ink:        "#0B0B0D",
    inkMuted:   "rgba(11,11,13,0.55)",
    inkDim:     "rgba(11,11,13,0.35)",
    borderSoft: "rgba(24,24,27,0.08)",
    cardBg:     "#ffffff",
    surfaceAlt: "rgba(11,11,13,0.025)",
    blueDeep:   "#1D4ED8",
  };
  return (
    <section>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 8 }}>
        {accentBar && (
          <div
            style={{
              width: 3,
              height: 16,
              borderRadius: 2,
              background: accentBar,
              flexShrink: 0,
              alignSelf: "center",
            }}
          />
        )}
        <div>
          <div style={{ fontFamily: FONT, fontSize: 14, fontWeight: 700, color: C2.ink, letterSpacing: -0.1 }}>
            {title}
            <span
              style={{
                marginLeft: 6,
                fontSize: 11,
                fontWeight: 600,
                color: C2.inkMuted,
                background: "rgba(11,11,13,0.06)",
                padding: "1px 6px",
                borderRadius: 999,
              }}
            >
              {items.length}
            </span>
          </div>
          <div style={{ fontSize: 12, color: C2.inkMuted, marginTop: 1, fontFamily: FONT }}>
            {description}
          </div>
        </div>
      </div>

      <div style={{ background: C2.cardBg, border: `1px solid ${C2.borderSoft}`, borderRadius: 14, overflow: "hidden" }}>
        {items.map((inq, idx) => (
          <Link
            key={inq.id}
            href={`/${tenantSlug}/client/inquiries/${inq.id}`}
            style={{
              display: "grid",
              gridTemplateColumns: "1fr auto",
              gap: 12,
              alignItems: "center",
              padding: "13px 16px",
              borderBottom: idx < items.length - 1 ? `1px solid ${C2.borderSoft}` : "none",
              fontFamily: FONT,
              textDecoration: "none",
              color: "inherit",
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
                      background: C2.blueDeep,
                      flexShrink: 0,
                    }}
                  />
                )}
              </div>
              <div
                style={{
                  fontSize: 13.5,
                  fontWeight: 600,
                  color: C2.ink,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {inq.company ?? "Booking inquiry"}
                {inq.event_location && (
                  <span style={{ color: C2.inkMuted, fontWeight: 400, marginLeft: 6 }}>
                    · {inq.event_location}
                  </span>
                )}
              </div>
              {inq.event_date && (
                <div style={{ fontSize: 11.5, color: C2.inkMuted, marginTop: 2 }}>
                  {fmtDate(inq.event_date)}
                  {inq.quantity && ` · ${inq.quantity} talent`}
                </div>
              )}
            </div>
            <div style={{ textAlign: "right", flexShrink: 0, fontSize: 11, color: C2.inkDim }}>
              {relativeDate(inq.created_at)}
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
