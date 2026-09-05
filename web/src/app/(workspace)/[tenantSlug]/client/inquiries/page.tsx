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
import { getRequestLocale } from "@/i18n/request-locale";
import { createTranslator } from "@/i18n/messages";
import { interpolate, withPluralization } from "@/i18n/interpolate";

export const dynamic = "force-dynamic";
type PageParams = Promise<{ tenantSlug: string }>;

type Translate = (key: string) => string;

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
  amberDeep:  "var(--color-admin-amber-deep)",
  amberSoft:  "rgba(138,111,26,0.10)",
} as const;

const FONT = '"Inter", system-ui, sans-serif';
const FONT_DISPLAY = 'var(--font-geist-sans), "Inter", -apple-system, system-ui, sans-serif';

function statusTone(status: string, t: Translate) {
  const map: Record<string, { bg: string; color: string; label: string }> = {
    booked:        { bg: C.successSoft,  color: C.successDeep, label: t("dashboard.clientInquiries.statusBooked") },
    converted:     { bg: C.successSoft,  color: C.successDeep, label: t("dashboard.clientInquiries.statusBooked") },
    approved:      { bg: C.accentSoft,   color: C.accent,      label: t("dashboard.clientInquiries.statusApproved") },
    offer_pending: { bg: C.amberSoft,    color: C.amberDeep,   label: t("dashboard.clientInquiries.statusOfferPending") },
    submitted:     { bg: C.accentSoft,   color: C.blueDeep,    label: t("dashboard.clientInquiries.statusSubmitted") },
    coordination:  { bg: C.accentSoft,   color: C.blueDeep,    label: t("dashboard.clientInquiries.statusInReview") },
    rejected:      { bg: C.surface,      color: C.inkDim,      label: t("dashboard.clientInquiries.statusDeclined") },
    expired:       { bg: C.surface,      color: C.inkDim,      label: t("dashboard.clientInquiries.statusExpired") },
    draft:         { bg: C.surface,      color: C.inkDim,      label: t("dashboard.clientInquiries.statusDraft") },
    closed:        { bg: C.surface,      color: C.inkDim,      label: t("dashboard.clientInquiries.statusClosed") },
    closed_lost:   { bg: C.surface,      color: C.inkDim,      label: t("dashboard.clientInquiries.statusClosed") },
    archived:      { bg: C.surface,      color: C.inkDim,      label: t("dashboard.clientInquiries.statusArchived") },
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

function relativeDate(iso: string, t: Translate): string {
  const now = Date.now();
  const then = clientDateMs(iso);
  if (then === null) return "-";
  const diffMs = now - then;
  const diffH = diffMs / (1000 * 60 * 60);
  if (diffH < 1) return t("dashboard.clientInquiries.justNow");
  if (diffH < 24) return interpolate(t("dashboard.clientInquiries.hoursAgo"), { count: Math.floor(diffH) });
  const diffD = diffH / 24;
  if (diffD < 7) return interpolate(t("dashboard.clientInquiries.daysAgo"), { count: Math.floor(diffD) });
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
  t,
}: {
  rows: InquiryRow[];
  label: string;
  tenantSlug: string;
  t: Translate;
}) {
  // Spanish needs real plural agreement here: the flat key rendered "3 talento".
  const tPlural = withPluralization(t);
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
          const s = statusTone(inq.status, t);
          const needsAction = inq.next_action_by === "client";
          const hasUnread = inq.unreadCount > 0;
          return (
            <Link
              key={inq.id}
              href={`/${tenantSlug}/client/messages?inquiry=${inq.id}`}
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
              <div className="min-w-0">
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
                      {t("dashboard.clientInquiries.yourTurn")}
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
                      {interpolate(t("dashboard.clientInquiries.newCount"), { count: inq.unreadCount })}
                    </span>
                  )}
                  {inq.source_pitch_id && (
                    <span
                      title={t("dashboard.clientInquiries.fromPitchTitle")}
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
                      {t("dashboard.clientInquiries.fromPitch")}
                    </span>
                  )}
                  {(inq.source_channel === "discover_single_talent" ||
                    inq.source_channel === "discover_shortlist") && (
                    <span
                      title={
                        inq.source_channel === "discover_shortlist"
                          ? t("dashboard.clientInquiries.shortlistTitle")
                          : t("dashboard.clientInquiries.discoverTitle")
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
                      {inq.source_channel === "discover_shortlist" ? t("dashboard.clientInquiries.shortlist") : t("dashboard.clientInquiries.discover")}
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
                  {inq.company ?? t("dashboard.clientInquiries.bookingInquiry")}
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
                      {tPlural("dashboard.clientInquiries.talentCount", inq.quantity)}
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
                <span>{relativeDate(inq.created_at, t)}</span>
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
  const locale = await getRequestLocale();
  const t = createTranslator(locale);
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
        eyebrow={t("dashboard.clientInquiries.eyebrow")}
        title={t("dashboard.clientInquiries.title")}
        subtitle={
          inquiries.length === 0
            ? t("dashboard.clientInquiries.subtitleEmpty")
            : interpolate(t("dashboard.clientInquiries.subtitleCounts"), { total: inquiries.length, open: open.length, closed: closed.length })
        }
        badge={needsClient > 0 ? <HeaderBadge tone="accent">{interpolate(t("dashboard.clientInquiries.needYouBadge"), { count: needsClient })}</HeaderBadge> : undefined}
        actions={<NewInquiryButton tenantSlug={tenantSlug} client={clientForBtn} roster={roster} />}
      />

      {inquiries.length === 0 ? (
        <EmptyState
          icon="📋"
          title={t("dashboard.clientInquiries.emptyTitle")}
          body={t("dashboard.clientInquiries.emptyBody")}
          actions={
            <>
              <NewInquiryButton tenantSlug={tenantSlug} client={clientForBtn} roster={roster} label={t("dashboard.clientInquiries.startInquiry")} />
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
                {t("dashboard.clientInquiries.browseRoster")}
              </Link>
            </>
          }
        />
      ) : (
        <div className="flex flex-col gap-7">
          <InquiryTable rows={open} label={t("dashboard.clientInquiries.sectionOpen")} tenantSlug={tenantSlug} t={t} />
          <InquiryTable rows={closed} label={t("dashboard.clientInquiries.sectionClosed")} tenantSlug={tenantSlug} t={t} />
        </div>
      )}
    </div>
  );
}
