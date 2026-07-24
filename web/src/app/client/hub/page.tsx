// CH1 (2026-07-24) — cross-agency client hub. Platform surface (app host):
// one view of every agency a client works with. This is a PAID capability —
// Pro/Enterprise on `client_subscriptions`; Standard sees an honest wall that
// says exactly what it unlocks.
//
// Deliberately lives on the platform host, not under /[tenantSlug]/client/*:
// aggregating a client's other agencies inside an agency's (possibly
// whitelabel) dashboard would leak one agency's client relationships into
// another's branded surface.

import Link from "next/link";
import { redirect } from "next/navigation";
import { getCachedActorSession } from "@/lib/server/request-cache";
import { loadClientPrimaryTenantSlug } from "@/lib/saas/role-tenant-resolver";
import { loadClientSubscription } from "@/lib/discover/client-subscription";
import { loadClientHubData, type HubBooking, type HubInquiry } from "@/lib/client-hub/load-hub";
import { getRequestLocale } from "@/i18n/request-locale";
import { createTranslator } from "@/i18n/messages";

export const dynamic = "force-dynamic";

const FONT = '"Inter", system-ui, sans-serif';
const C = {
  surface: "#FAFAF7",
  card: "#ffffff",
  ink: "#0B0B0D",
  inkMuted: "rgba(11,11,13,0.55)",
  inkDim: "rgba(11,11,13,0.35)",
  border: "rgba(24,24,27,0.08)",
  accent: "#1D4ED8",
  accentSoft: "rgba(29,78,216,0.08)",
  greenDeep: "#0F5132",
  greenSoft: "rgba(26,115,72,0.10)",
} as const;

function fmtMoney(cents: number, currency: string, locale: string) {
  return new Intl.NumberFormat(locale === "es" ? "es-ES" : locale === "fr" ? "fr-FR" : "en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

function fmtDate(iso: string | null, fallback: string) {
  if (!iso) return fallback;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return fallback;
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}

export default async function ClientHubPage() {
  const session = await getCachedActorSession();
  if (!session.user) redirect(`/login?next=${encodeURIComponent("/client/hub")}`);

  const locale = await getRequestLocale();
  const t = createTranslator(locale);
  const tt = (key: string, fallback: string) => {
    const v = t(key);
    return v === key ? fallback : v;
  };

  const [subscription, primarySlug] = await Promise.all([
    loadClientSubscription(session.user.id),
    loadClientPrimaryTenantSlug(session.user.id).catch(() => null),
  ]);

  const isPaid = subscription.tier === "pro" || subscription.tier === "enterprise";
  const backHref = primarySlug ? `/${primarySlug}/client/today` : "/client";
  const upgradeHref = primarySlug ? `/${primarySlug}/client/subscription` : "/client";

  const hub = isPaid ? await loadClientHubData(session.user.id) : null;

  return (
    <div style={{ minHeight: "100dvh", background: C.surface, fontFamily: FONT }}>
      <header
        style={{
          background: "#fff",
          borderBottom: `1px solid ${C.border}`,
          padding: "0 24px",
          height: 56,
          display: "flex",
          alignItems: "center",
          gap: 14,
        }}
      >
        <Link href={backHref} style={{ fontSize: 13, fontWeight: 600, color: C.ink, textDecoration: "none" }}>
          ← {tt("dashboard.clientHub.back", "Back to dashboard")}
        </Link>
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 12, color: C.inkMuted }}>Tulala</span>
      </header>

      <main style={{ maxWidth: 1080, margin: "0 auto", padding: "28px 24px 72px" }}>
        <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: 0.8, textTransform: "uppercase", color: C.inkMuted }}>
          {tt("dashboard.clientHub.eyebrow", "All agencies")}
        </div>
        <h1 style={{ fontSize: 26, fontWeight: 700, letterSpacing: -0.4, margin: "6px 0 4px", color: C.ink }}>
          {tt("dashboard.clientHub.title", "Your hub")}
        </h1>
        <p style={{ fontSize: 13.5, color: C.inkMuted, margin: "0 0 24px", lineHeight: 1.6 }}>
          {tt(
            "dashboard.clientHub.subtitle",
            "Every agency you work with, in one place. Inquiries that need you, what is coming up, and what you owe.",
          )}
        </p>

        {!isPaid ? (
          <UpgradeWall upgradeHref={upgradeHref} tt={tt} />
        ) : hub && hub.totals.agencies === 0 ? (
          <div
            style={{
              background: C.card,
              border: `1px solid ${C.border}`,
              borderRadius: 14,
              padding: "40px 24px",
              textAlign: "center",
            }}
          >
            <div style={{ fontSize: 15, fontWeight: 600, color: C.ink, marginBottom: 6 }}>
              {tt("dashboard.clientHub.emptyTitle", "No agencies yet")}
            </div>
            <p style={{ fontSize: 13, color: C.inkMuted, margin: 0, lineHeight: 1.6 }}>
              {tt(
                "dashboard.clientHub.emptyBody",
                "Once you send an inquiry to an agency it will show up here alongside every other agency you work with.",
              )}
            </p>
          </div>
        ) : hub ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 26 }}>
            {/* Totals */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12 }}>
              <Tile label={tt("dashboard.clientHub.agencies", "Agencies")} value={String(hub.totals.agencies)} />
              <Tile label={tt("dashboard.clientHub.openInquiries", "Open inquiries")} value={String(hub.totals.openInquiries)} />
              <Tile
                label={tt("dashboard.clientHub.needsYou", "Needs you")}
                value={String(hub.needsYou.length)}
                accent={hub.needsYou.length > 0}
              />
              <Tile
                label={tt("dashboard.clientBookings.paymentDue", "Payment due")}
                value={
                  hub.dueByCurrency.length > 0
                    ? fmtMoney(hub.dueByCurrency[0].cents, hub.dueByCurrency[0].currency, locale)
                    : fmtMoney(0, "USD", locale)
                }
                sub={
                  hub.dueByCurrency.length > 1
                    ? `+ ${hub.dueByCurrency.length - 1} ${tt("dashboard.clientHub.moreCurrencies", "more currencies")}`
                    : undefined
                }
                accent={hub.dueByCurrency.length > 0}
              />
            </div>

            {/* Agencies */}
            <section>
              <SectionLabel>{tt("dashboard.clientHub.yourAgencies", "Your agencies")}</SectionLabel>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 12 }}>
                {hub.agencies.map((a) => (
                  <Link
                    key={a.tenantId}
                    href={`/${a.slug}/client/today`}
                    style={{
                      background: C.card,
                      border: `1px solid ${C.border}`,
                      borderRadius: 12,
                      padding: "14px 16px",
                      textDecoration: "none",
                      display: "block",
                    }}
                  >
                    <div style={{ fontSize: 14, fontWeight: 700, color: C.ink, marginBottom: 6 }}>{a.displayName}</div>
                    <div style={{ display: "flex", gap: 10, flexWrap: "wrap", fontSize: 11.5, color: C.inkMuted }}>
                      <span>
                        {a.openInquiries} {tt("dashboard.clientHub.open", "open")}
                      </span>
                      <span>·</span>
                      <span>
                        {a.bookings} {tt("dashboard.clientHub.booked", "booked")}
                      </span>
                      {a.needsYou > 0 && (
                        <>
                          <span>·</span>
                          <span style={{ color: C.accent, fontWeight: 700 }}>
                            {a.needsYou} {tt("dashboard.clientHub.needsYouShort", "needs you")}
                          </span>
                        </>
                      )}
                    </div>
                  </Link>
                ))}
              </div>
            </section>

            {/* Needs you */}
            {hub.needsYou.length > 0 && (
              <section>
                <SectionLabel>{tt("dashboard.clientHub.needsYouTitle", "Needs your decision")}</SectionLabel>
                <RowCard>
                  {hub.needsYou.map((i, idx) => (
                    <InquiryRow key={i.id} inq={i} last={idx === hub.needsYou.length - 1} tt={tt} />
                  ))}
                </RowCard>
              </section>
            )}

            {/* Upcoming */}
            {hub.upcoming.length > 0 && (
              <section>
                <SectionLabel>{tt("dashboard.clientHub.upcomingTitle", "Coming up")}</SectionLabel>
                <RowCard>
                  {hub.upcoming.map((b, idx) => (
                    <BookingRow key={b.id} b={b} last={idx === hub.upcoming.length - 1} locale={locale} tt={tt} />
                  ))}
                </RowCard>
              </section>
            )}
          </div>
        ) : null}
      </main>
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        fontSize: 10.5,
        fontWeight: 700,
        letterSpacing: 0.8,
        textTransform: "uppercase",
        color: C.inkMuted,
        marginBottom: 10,
      }}
    >
      {children}
    </div>
  );
}

function RowCard({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, overflow: "hidden" }}>
      {children}
    </div>
  );
}

function Tile({ label, value, sub, accent = false }: { label: string; value: string; sub?: string; accent?: boolean }) {
  return (
    <div
      style={{
        background: accent ? C.accentSoft : C.card,
        border: `1px solid ${accent ? "rgba(29,78,216,0.20)" : C.border}`,
        borderRadius: 12,
        padding: "14px 16px",
      }}
    >
      <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: 0.6, textTransform: "uppercase", color: C.inkMuted, marginBottom: 4 }}>
        {label}
      </div>
      <div style={{ fontSize: 26, fontWeight: 600, color: accent ? C.accent : C.ink, lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>
        {value}
      </div>
      {sub && <div style={{ fontSize: 11, color: C.inkMuted, marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

function AgencyChip({ name }: { name: string }) {
  return (
    <span
      style={{
        fontSize: 10,
        fontWeight: 700,
        letterSpacing: 0.3,
        textTransform: "uppercase",
        padding: "2px 7px",
        borderRadius: 999,
        background: "rgba(11,11,13,0.05)",
        color: C.inkMuted,
        whiteSpace: "nowrap",
      }}
    >
      {name}
    </span>
  );
}

function InquiryRow({ inq, last, tt }: { inq: HubInquiry; last: boolean; tt: (k: string, f: string) => string }) {
  return (
    <Link
      href={`/${inq.agencySlug}/client/messages?inquiry=${inq.id}`}
      style={{
        display: "grid",
        gridTemplateColumns: "1fr auto",
        gap: 12,
        alignItems: "center",
        padding: "13px 16px",
        borderBottom: last ? "none" : `1px solid ${C.border}`,
        textDecoration: "none",
        color: "inherit",
      }}
    >
      <div style={{ minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3 }}>
          <AgencyChip name={inq.agencyName} />
          <span style={{ width: 6, height: 6, borderRadius: "50%", background: C.accent, flexShrink: 0 }} />
        </div>
        <div style={{ fontSize: 13.5, fontWeight: 600, color: C.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {inq.company ?? inq.eventLocation ?? tt("dashboard.clientHub.inquiry", "Booking inquiry")}
        </div>
        {inq.eventDate && (
          <div style={{ fontSize: 11.5, color: C.inkMuted, marginTop: 2 }}>
            {fmtDate(inq.eventDate, "-")}
          </div>
        )}
      </div>
      <span style={{ fontSize: 11.5, fontWeight: 700, color: C.accent, whiteSpace: "nowrap" }}>
        {tt("dashboard.clientHub.review", "Review")} →
      </span>
    </Link>
  );
}

function BookingRow({
  b,
  last,
  locale,
  tt,
}: {
  b: HubBooking;
  last: boolean;
  locale: string;
  tt: (k: string, f: string) => string;
}) {
  const due = b.paymentStatus === "unpaid" || b.paymentStatus === "partial";
  return (
    <Link
      href={`/${b.agencySlug}/client/messages?inquiry=${b.id}`}
      style={{
        display: "grid",
        gridTemplateColumns: "1fr auto",
        gap: 12,
        alignItems: "center",
        padding: "13px 16px",
        borderBottom: last ? "none" : `1px solid ${C.border}`,
        textDecoration: "none",
        color: "inherit",
      }}
    >
      <div style={{ minWidth: 0 }}>
        <div style={{ marginBottom: 3 }}>
          <AgencyChip name={b.agencyName} />
        </div>
        <div style={{ fontSize: 13.5, fontWeight: 600, color: C.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {b.company ?? b.eventLocation ?? tt("dashboard.clientHub.booking", "Confirmed booking")}
        </div>
        <div style={{ fontSize: 11.5, color: C.inkMuted, marginTop: 2 }}>
          {fmtDate(b.eventDate, tt("dashboard.clientBookings.dateTbc", "Date being confirmed"))}
          {b.amountCents != null && b.currencyCode
            ? ` · ${fmtMoney(b.amountCents, b.currencyCode, locale)}`
            : ""}
        </div>
      </div>
      <span
        style={{
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: 0.3,
          textTransform: "uppercase",
          padding: "3px 9px",
          borderRadius: 999,
          background: due ? C.accentSoft : C.greenSoft,
          color: due ? C.accent : C.greenDeep,
          whiteSpace: "nowrap",
        }}
      >
        {due
          ? tt("dashboard.clientBookings.paymentDue", "Payment due")
          : tt("dashboard.clientBookings.paid", "Paid")}
      </span>
    </Link>
  );
}

function UpgradeWall({ upgradeHref, tt }: { upgradeHref: string; tt: (k: string, f: string) => string }) {
  const bullets: [string, string][] = [
    ["dashboard.clientHub.sell1", "Every agency you work with on one screen"],
    ["dashboard.clientHub.sell2", "One list of the inquiries waiting on your decision"],
    ["dashboard.clientHub.sell3", "All upcoming bookings in date order, whoever is coordinating"],
    ["dashboard.clientHub.sell4", "What you owe across every agency, in every currency"],
  ];
  return (
    <div
      style={{
        background: C.card,
        border: `1px solid ${C.border}`,
        borderRadius: 16,
        padding: "28px 26px",
        maxWidth: 640,
      }}
    >
      <span
        style={{
          display: "inline-block",
          fontSize: 10,
          fontWeight: 800,
          letterSpacing: 0.6,
          textTransform: "uppercase",
          padding: "3px 9px",
          borderRadius: 999,
          background: C.accentSoft,
          color: C.accent,
          marginBottom: 12,
        }}
      >
        {tt("dashboard.clientHub.proBadge", "Pro")}
      </span>
      <div style={{ fontSize: 18, fontWeight: 700, color: C.ink, letterSpacing: -0.2, marginBottom: 8 }}>
        {tt("dashboard.clientHub.wallTitle", "The hub is part of Pro")}
      </div>
      <p style={{ fontSize: 13.5, color: C.inkMuted, lineHeight: 1.65, margin: "0 0 16px" }}>
        {tt(
          "dashboard.clientHub.wallBody",
          "You are booking across more than one agency. Pro puts all of it in a single view so nothing waits on you unnoticed.",
        )}
      </p>
      <ul style={{ listStyle: "none", padding: 0, margin: "0 0 22px", display: "flex", flexDirection: "column", gap: 9 }}>
        {bullets.map(([key, fallback]) => (
          <li key={key} style={{ display: "flex", gap: 9, alignItems: "flex-start", fontSize: 13, color: C.ink }}>
            <span aria-hidden style={{ color: C.accent, fontWeight: 700, lineHeight: 1.5 }}>
              ✓
            </span>
            <span style={{ lineHeight: 1.5 }}>{tt(key, fallback)}</span>
          </li>
        ))}
      </ul>
      <Link
        href={upgradeHref}
        style={{
          display: "inline-flex",
          alignItems: "center",
          height: 40,
          padding: "0 18px",
          borderRadius: 10,
          background: C.accent,
          color: "#fff",
          fontSize: 13.5,
          fontWeight: 700,
          textDecoration: "none",
        }}
      >
        {tt("dashboard.clientHub.seePlans", "See plans")}
      </Link>
    </div>
  );
}
