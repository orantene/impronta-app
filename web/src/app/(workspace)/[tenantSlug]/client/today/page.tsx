// Phase 3.10 — Client Today page.
// Shows the client's pulse: active inquiries + upcoming bookings + quick stats.

import { notFound } from "next/navigation";
import Link from "next/link";
import { getTenantPortalScopeBySlug } from "@/lib/saas/scope";
import { getRequestLocale } from "@/i18n/request-locale";
import { createTranslator } from "@/i18n/messages";
import { interpolate, withPluralization } from "@/i18n/interpolate";
import { getCachedActorSession } from "@/lib/server/request-cache";
import {
  loadClientSelfProfile,
  loadClientInquiries,
  loadWorkspaceRosterLite,
} from "../../_data-bridge";
import { loadClientUpcoming } from "../../_data-bridge/client-upcoming";
import { loadClientBookings } from "../../_data-bridge/bookings";
import { clientDateMs, formatClientDate } from "../date-format";
import { ClientPageHeader, HeaderBadge } from "../_components/ClientPageHeader";
import { NewInquiryButton } from "../_components/NewInquiryButton";
import { StatusChip } from "../_components/StatusChip";
import { EmptyState } from "../_components/EmptyState";
import { TodayPriorityCard, UpcomingEventsTile } from "./_components/TodayPriorityCard";

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
  amberDeep:    "var(--color-admin-amber-deep)",
  amberSoft:    "rgba(138,111,26,0.10)",
} as const;

const FONT = '"Inter", system-ui, sans-serif';

type Translator = (key: string) => string;

// StatusChip + statusTone now come from ../_components/StatusChip (unified).

function fmtDate(iso: string | null): string {
  return formatClientDate(iso, "-");
}

// Reuses the already-translated relative-time keys under
// `dashboard.clientInquiries.*` rather than minting a second set.
function relativeDate(iso: string, resolve: (key: string, fallback: string) => string): string {
  const now = Date.now();
  const then = clientDateMs(iso);
  if (then === null) return "-";
  const diffMs = now - then;
  const diffH = diffMs / (1000 * 60 * 60);
  if (diffH < 1) return resolve("dashboard.clientInquiries.justNow", "just now");
  if (diffH < 24) return interpolate(resolve("dashboard.clientInquiries.hoursAgo", "{count}h ago"), { count: Math.floor(diffH) });
  const diffD = diffH / 24;
  if (diffD < 7) return interpolate(resolve("dashboard.clientInquiries.daysAgo", "{count}d ago"), { count: Math.floor(diffD) });
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
  const locale = await getRequestLocale();
  const t = createTranslator(locale);
  const session = await getCachedActorSession();
  if (!session.user) notFound();

  const scope = await getTenantPortalScopeBySlug(tenantSlug);
  if (!scope) notFound();

  const clientProfile = await loadClientSelfProfile(session.user.id, scope.tenantId);
  if (!clientProfile) notFound();

  const [allInquiries, roster, upcoming, bookings] = await Promise.all([
    loadClientInquiries(session.user.id, scope.tenantId),
    loadWorkspaceRosterLite(scope.tenantId),
    loadClientUpcoming(session.user.id, scope.tenantId),
    loadClientBookings(session.user.id, scope.tenantId),
  ]);

  const todayBooking = upcoming.find((u) => u.bucket === "today") ?? null;
  const thisWeekBookings = upcoming.filter((u) => u.bucket === "this_week");

  const firstName = clientProfile.displayName.split(" ")[0] ?? clientProfile.displayName;

  // CW2 — statuses that are DONE. An archived/closed inquiry must never sit
  // under "Needs your decision" (next_action_by can be stale on terminal
  // rows) nor pad out "Agency is coordinating".
  const TERMINAL = ["declined", "rejected", "cancelled", "expired", "closed", "closed_lost", "archived", "draft"];
  const isTerminal = (status: string) => TERMINAL.includes(status);
  const needsDecision  = allInquiries.filter((i) =>
    !isTerminal(i.status) &&
    !["booked", "converted"].includes(i.status) &&
    (i.next_action_by === "client" || i.status === "offer_pending"),
  );
  const agencyHasIt    = allInquiries.filter((i) =>
    !isTerminal(i.status) &&
    !["booked", "converted"].includes(i.status) &&
    i.next_action_by !== "client" &&
    i.status !== "offer_pending",
  );
  const confirmed      = allInquiries.filter((i) =>
    ["booked", "converted"].includes(i.status),
  );

  // For stats
  const activeCount    = allInquiries.filter((i) =>
    ["submitted", "coordination", "offer_pending", "approved"].includes(i.status),
  ).length;

  // CW2 — money strip: what the client still owes across confirmed bookings.
  // Gross-only, same as the Bookings page. Mixed currencies are summed per
  // currency and the dominant one is shown (others noted in the sub line).
  const dueRows = bookings.filter(
    (b) => (b.paymentStatus === "unpaid" || b.paymentStatus === "partial") && (b.amountCents ?? 0) > 0,
  );
  const dueByCurrency = new Map<string, number>();
  for (const b of dueRows) {
    const cur = (b.currencyCode ?? "USD").toUpperCase();
    dueByCurrency.set(cur, (dueByCurrency.get(cur) ?? 0) + (b.amountCents ?? 0));
  }
  const dueEntries = [...dueByCurrency.entries()].sort((a, b2) => b2[1] - a[1]);
  const dueMain = dueEntries[0] ?? null;
  const fmtMoney = (cents: number, cur: string) =>
    new Intl.NumberFormat("en-US", { style: "currency", currency: cur, maximumFractionDigits: 0 }).format(cents / 100);

  // Context-aware headline
  const tPlural = withPluralization(t);
  let headline: string;
  let subline: string;
  if (allInquiries.length === 0) {
    headline = interpolate(t("client.today.welcomeHeadline"), { name: firstName });
    subline = t("client.today.welcomeSubline");
  } else if (needsDecision.length > 0) {
    headline = tPlural("client.today.needsAttentionHeadline", needsDecision.length);
    subline = t("client.today.needsAttentionSubline");
  } else if (agencyHasIt.length > 0) {
    headline = tPlural("client.today.inProgressHeadline", agencyHasIt.length);
    subline = interpolate(t("client.today.inProgressSubline"), { agency: clientProfile.agencyName });
  } else {
    headline = interpolate(t("client.today.calmHeadline"), { name: firstName });
    subline = confirmed.length > 0
      ? tPlural("client.today.calmSublineConfirmed", confirmed.length)
      : t("client.today.calmSublineEmpty");
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24, fontFamily: FONT, paddingBottom: "calc(72px + env(safe-area-inset-bottom))" }}>
      <style>{`.client-inq-row:hover { background: ${C.surfaceAlt}; }`}</style>

      <ClientPageHeader
        eyebrow={clientProfile.agencyName}
        title={headline}
        subtitle={subline}
        badge={needsDecision.length > 0 ? <HeaderBadge tone="accent">{interpolate(t("dashboard.clientInquiries.needYouBadge"), { count: needsDecision.length })}</HeaderBadge> : undefined}
        actions={
          <NewInquiryButton
            tenantSlug={tenantSlug}
            client={{
              displayName: clientProfile.displayName,
              company: clientProfile.company,
              agencyName: clientProfile.agencyName,
              userId: session.user.id,
              email: session.user.email,
              trustLevel: "basic",
            }}
            roster={roster}
          />
        }
      />

      {/* Phase F — Today priority card. Renders ONLY when there's a
          confirmed/imminent event happening today. Calls + map + call
          sheet are one tap away. */}
      {todayBooking && (
        <TodayPriorityCard booking={todayBooking} tenantSlug={tenantSlug} />
      )}

      {/* Phase F — Upcoming events this week (lower visual weight, same
          drawer). Hidden when today's event already surfaces above. */}
      {!todayBooking && thisWeekBookings.length > 0 && (
        <UpcomingEventsTile bookings={thisWeekBookings} tenantSlug={tenantSlug} />
      )}

      {/* Stat tiles */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 12 }}>
        <StatTile label={t("client.today.statActive")} value={activeCount.toString()} sub={t("client.today.statActiveSub")} />
        <StatTile
          label={t("client.today.statNeedsReply")}
          value={needsDecision.length.toString()}
          sub={needsDecision.length > 0 ? t("client.today.statNeedsReplySub") : t("client.today.statUpToDateSub")}
          accent={needsDecision.length > 0}
        />
        <StatTile label={t("client.today.statConfirmed")} value={confirmed.length.toString()} sub={t("client.today.statConfirmedSub")} />
        {dueMain ? (
          <Link href={`/${tenantSlug}/client/bookings`} style={{ textDecoration: "none" }}>
            <StatTile
              label={t("dashboard.clientBookings.paymentDue")}
              value={fmtMoney(dueMain[1], dueMain[0])}
              sub={
                dueEntries.length > 1
                  ? tPlural("client.today.dueMoreCurrencies", dueEntries.length - 1)
                  : tPlural("client.today.dueAwaitingPayment", dueRows.length)
              }
              accent
            />
          </Link>
        ) : (
          <StatTile label={t("client.today.statTotal")} value={allInquiries.length.toString()} sub={t("client.today.statTotalSub")} />
        )}
      </div>

      {allInquiries.length === 0 ? (
        <EmptyState
          icon="📋"
          title={t("dashboard.clientInquiries.emptyTitle")}
          body={t("client.today.emptyBody")}
          actions={
            <>
              <NewInquiryButton
                tenantSlug={tenantSlug}
                client={{
                  displayName: clientProfile.displayName,
                  company: clientProfile.company,
                  agencyName: clientProfile.agencyName,
                }}
                roster={roster}
                label={t("dashboard.clientInquiries.startInquiry")}
              />
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
        /* Three-bucket layout */
        <div className="flex flex-col gap-5">

          {/* Bucket 1 — Needs your decision */}
          {needsDecision.length > 0 && (
            <BucketSection
              title={t("client.today.bucketDecisionTitle")}
              description={t("client.today.bucketDecisionDesc")}
              accentBar="#1D4ED8"
              items={needsDecision}
              tenantSlug={tenantSlug}
              t={t}
            />
          )}

          {/* Bucket 2 — Agency has it */}
          {agencyHasIt.length > 0 && (
            <BucketSection
              title={t("client.today.bucketCoordinatingTitle")}
              description={t("client.today.bucketCoordinatingDesc")}
              items={agencyHasIt.slice(0, 5)}
              totalCount={agencyHasIt.length}
              viewAllHref={agencyHasIt.length > 5 ? `/${tenantSlug}/client/inquiries` : undefined}
              viewAllLabel={t("dashboard.clientBookings.viewAll")}
              tenantSlug={tenantSlug}
              t={t}
            />
          )}

          {/* Bucket 3 — Confirmed */}
          {confirmed.length > 0 && (
            <BucketSection
              title={t("client.today.bucketComingUpTitle")}
              description={t("client.today.bucketComingUpDesc")}
              accentBar="#1A7348"
              items={confirmed}
              tenantSlug={tenantSlug}
              t={t}
            />
          )}

          <div style={{ textAlign: "center", paddingTop: 4 }}>
            <Link href={`/${tenantSlug}/client/inquiries`} style={{ fontSize: 12.5, color: C.blueDeep, fontWeight: 600, textDecoration: "none", fontFamily: FONT }}>
              {t("client.today.viewAllInquiries")}
            </Link>
          </div>
        </div>
      )}

    </div>
  );
}

type ClientInquiry = Awaited<ReturnType<typeof loadClientInquiries>>[number];

function BucketSection({
  title,
  description,
  accentBar,
  items,
  totalCount,
  viewAllHref,
  viewAllLabel,
  tenantSlug,
  t,
}: {
  title: string;
  description: string;
  accentBar?: string;
  items: ClientInquiry[];
  /** CW2 — real total when the list is capped (badge shows this, not items.length). */
  totalCount?: number;
  /** CW2 — when set, a "View all" link renders under the capped list. */
  viewAllHref?: string;
  viewAllLabel?: string;
  tenantSlug: string;
  /** Translator for the shared StatusChip labels + row copy. */
  t?: Translator;
}) {
  const tr: Translator = t ?? ((key: string) => key);
  const resolve = (key: string, fallback: string) => {
    const out = tr(key);
    return out === key ? fallback : out;
  };
  const resolvedViewAll = viewAllLabel ?? resolve("dashboard.clientBookings.viewAll", "View all");
  // Own plural-correct key: the shared dashboard.clientInquiries.talentCount has
  // a singular-only Spanish form ("{count} talento").
  const talentCountLabel = (n: number) =>
    interpolate(
      resolve(
        `client.today.talentCount.${n === 1 ? "one" : "other"}`,
        n === 1 ? "{count} talent" : "{count} talents",
      ),
      { count: n },
    );
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
              {totalCount ?? items.length}
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
            href={`/${tenantSlug}/client/messages?inquiry=${inq.id}`}
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
            <div className="min-w-0" style={{ display: "flex", alignItems: "center", gap: 10 }}>
              {/* CW2 — WHO the inquiry is about, at a glance. Initials chips
                  (headshot wiring lands with CW3's bookings work). */}
              {inq.talentLineup.length > 0 && (
                <div style={{ display: "flex", flexShrink: 0 }} aria-hidden>
                  {inq.talentLineup.slice(0, 3).map((t2, ti) => (
                    <span
                      key={t2.id}
                      title={t2.name}
                      style={{
                        width: 26,
                        height: 26,
                        borderRadius: "50%",
                        background: `hsl(${(t2.name.charCodeAt(0) * 47) % 360} 25% 88%)`,
                        color: "rgba(11,11,13,0.62)",
                        border: "1.5px solid #fff",
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: 10.5,
                        fontWeight: 700,
                        marginLeft: ti === 0 ? 0 : -7,
                      }}
                    >
                      {t2.name[0]?.toUpperCase()}
                    </span>
                  ))}
                </div>
              )}
              <div className="min-w-0">
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3 }}>
                  <StatusChip status={inq.status} t={t} />
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
                  {/* CW2 — a row must always say WHO/WHAT: company, else the
                      talent lineup, else the venue. Bare "Booking inquiry"
                      only when the record genuinely has none of those. */}
                  {inq.company
                    ?? (inq.talentLineup.length > 0
                      ? inq.talentLineup.map((t2) => t2.name).join(", ")
                      : inq.event_location ?? resolve("dashboard.clientInquiries.bookingInquiry", "Booking inquiry"))}
                  {inq.company && inq.event_location && (
                    <span style={{ color: C2.inkMuted, fontWeight: 400, marginLeft: 6 }}>
                      · {inq.event_location}
                    </span>
                  )}
                </div>
                {(inq.event_date || inq.talentLineup.length > 0) && (
                  <div style={{ fontSize: 11.5, color: C2.inkMuted, marginTop: 2 }}>
                    {[
                      inq.event_date ? fmtDate(inq.event_date) : null,
                      inq.talentLineup.length > 0 && inq.company
                        ? inq.talentLineup.map((t2) => t2.name).join(", ")
                        : inq.quantity
                          ? talentCountLabel(inq.quantity)
                          : null,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </div>
                )}
              </div>
            </div>
            <div style={{ textAlign: "right", flexShrink: 0, fontSize: 11, color: C2.inkDim }}>
              {relativeDate(inq.created_at, resolve)}
            </div>
          </Link>
        ))}
      </div>
      {viewAllHref && (
        <div style={{ marginTop: 8, textAlign: "right" }}>
          <Link
            href={viewAllHref}
            style={{ fontSize: 12, color: C2.blueDeep, fontWeight: 600, textDecoration: "none", fontFamily: FONT }}
          >
            {resolvedViewAll} {totalCount} →
          </Link>
        </div>
      )}
    </section>
  );
}
