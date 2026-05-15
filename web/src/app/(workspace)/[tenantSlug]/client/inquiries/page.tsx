// Phase 3.10 — Client Inquiries page.
// Full list of all inquiries this client has submitted to this agency,
// with status chips, event details, and timestamps.

import { notFound } from "next/navigation";
import Link from "next/link";
import { getTenantPortalScopeBySlug } from "@/lib/saas/scope";
import { getCachedActorSession } from "@/lib/server/request-cache";
import {
  loadClientSelfProfile,
  loadClientInquiries,
  loadWorkspaceRosterLite,
} from "../../_data-bridge";
import { clientDateMs, formatClientDate } from "../date-format";
import { ClientPageHeader, HeaderBadge } from "../_components/ClientPageHeader";
import { NewInquiryButton } from "../_components/NewInquiryButton";
import { EmptyState } from "../_components/EmptyState";

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
  return map[status] ?? {
    bg: C.surface,
    color: C.inkDim,
    label: status.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
  };
}

function fmtDate(iso: string | null): string {
  return formatClientDate(iso, "-");
}

function relativeDate(iso: string): string {
  const now = Date.now();
  const then = clientDateMs(iso);
  if (then === null) return "-";
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

type InquiryRow = Awaited<ReturnType<typeof loadClientInquiries>>[number];

function InquiryTable({
  rows,
  label,
  tenantSlug,
}: {
  rows: InquiryRow[];
  label: string;
  tenantSlug: string;
}) {
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
          const hasUnread = inq.unreadCount > 0;
          return (
            <Link
              key={inq.id}
              href={`/${tenantSlug}/client/inquiries/${inq.id}`}
              style={{
                display: "grid",
                gridTemplateColumns: "1fr auto",
                gap: 16,
                alignItems: "center",
                padding: "14px 18px",
                borderBottom: idx < rows.length - 1 ? `1px solid ${C.borderSoft}` : "none",
                fontFamily: FONT,
                background: needsAction || hasUnread ? "rgba(29,78,216,0.03)" : "transparent",
                textDecoration: "none",
                color: "inherit",
                transition: "background 0.1s",
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
                  {hasUnread && (
                    <span
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
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
                      {inq.unreadCount} new
                    </span>
                  )}
                  {inq.source_pitch_id && (
                    <span
                      title="Originated from a curated pitch sent by your agency"
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 4,
                        padding: "1px 7px",
                        borderRadius: 999,
                        background: "rgba(15,79,62,0.08)",
                        color: "#0F4F3E",
                        fontSize: 10,
                        fontWeight: 700,
                        letterSpacing: 0.3,
                        fontFamily: FONT,
                      }}
                    >
                      <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                        <line x1="22" y1="2" x2="11" y2="13" />
                        <polygon points="22 2 15 22 11 13 2 9 22 2" />
                      </svg>
                      From a pitch
                    </span>
                  )}
                  {(inq.source_channel === "discover_single_talent" ||
                    inq.source_channel === "discover_shortlist") && (
                    <span
                      title={
                        inq.source_channel === "discover_shortlist"
                          ? "You sent this inquiry to multiple talents from a Discover shortlist"
                          : "You sent this inquiry from Discover"
                      }
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 4,
                        padding: "1px 7px",
                        borderRadius: 999,
                        background: "rgba(29,78,216,0.08)",
                        color: "#1D4ED8",
                        fontSize: 10,
                        fontWeight: 700,
                        letterSpacing: 0.3,
                        fontFamily: FONT,
                      }}
                    >
                      <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                        <circle cx="11" cy="11" r="8" />
                        <line x1="21" y1="21" x2="16.65" y2="16.65" />
                      </svg>
                      {inq.source_channel === "discover_shortlist" ? "Shortlist" : "Discover"}
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
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "flex-end",
                  gap: 8,
                }}
              >
                <span>{relativeDate(inq.created_at)}</span>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={C.inkDim} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M9 5l7 7-7 7" />
                </svg>
              </div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}

export default async function ClientInquiriesPage({ params }: { params: PageParams }) {
  const { tenantSlug } = await params;
  const session = await getCachedActorSession();
  if (!session.user) notFound();

  const scope = await getTenantPortalScopeBySlug(tenantSlug);
  if (!scope) notFound();

  const clientProfile = await loadClientSelfProfile(session.user.id, scope.tenantId);
  if (!clientProfile) notFound();

  const [inquiries, roster] = await Promise.all([
    loadClientInquiries(session.user.id, scope.tenantId),
    loadWorkspaceRosterLite(scope.tenantId),
  ]);

  const open   = inquiries.filter((i) => !isTerminal(i.status));
  const closed = inquiries.filter((i) => isTerminal(i.status));
  const needsClient = inquiries.filter((i) => i.next_action_by === "client").length;

  const clientForBtn = {
    displayName: clientProfile.displayName,
    company: clientProfile.company,
    agencyName: clientProfile.agencyName,
  };

  return (
    <div style={{ fontFamily: FONT }}>
      <ClientPageHeader
        eyebrow="Inquiries"
        title="Your inquiries"
        subtitle={
          inquiries.length === 0
            ? "Every brief you've sent the workspace will appear here."
            : `${inquiries.length} total · ${open.length} open · ${closed.length} closed`
        }
        badge={needsClient > 0 ? <HeaderBadge tone="accent">{needsClient} need you</HeaderBadge> : undefined}
        actions={<NewInquiryButton tenantSlug={tenantSlug} client={clientForBtn} roster={roster} />}
      />

      {inquiries.length === 0 ? (
        <EmptyState
          icon="📋"
          title="No inquiries yet"
          body="Send a booking inquiry now, or browse Discover first if you want to pick a specific talent."
          actions={
            <>
              <NewInquiryButton tenantSlug={tenantSlug} client={clientForBtn} roster={roster} label="Start inquiry" />
              <Link
                href={`/${tenantSlug}/client/discover`}
                style={{
                  display: "inline-flex",
                  height: 38,
                  padding: "0 14px",
                  borderRadius: 9,
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
            </>
          }
        />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
          <InquiryTable rows={open} label="Open" tenantSlug={tenantSlug} />
          <InquiryTable rows={closed} label="Closed" tenantSlug={tenantSlug} />
        </div>
      )}
    </div>
  );
}
