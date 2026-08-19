"use client";

/**
 * WebsiteAnalyticsPage.tsx — Website → Analytics (W2).
 *
 * WHERE THIS CAME FROM
 * ────────────────────
 * The collapsible "Performance" panel at the bottom of Overview
 * (`WebsitePerformance`, WebsitePage-2.tsx). An audit found that panel telling
 * three structural lies, and this page exists to replace it with numbers that
 * are all real:
 *
 *   1. `prior` was hardcoded to zeros → every KPI delta permanently read
 *      "flat vs 0". NOW: the 7d view compares against a REAL prior window
 *      (days 8-14, derived from the same 30d fetch). The 30d view renders NO
 *      delta at all — a 30d baseline needs 60 days of history the loader does
 *      not scan, and no delta is more honest than a fake one.
 *   2. Per-page Inquiries / Bookings / Conv% columns were hardcoded 0 — no
 *      per-page attribution exists in the data. NOW: those columns are gone.
 *      Top pages show what is real: visits and the surfaces they came from.
 *   3. The Talent tab read from `byTalent7d/30d`, which nothing ever populated
 *      → it could only ever show its empty state. NOW: the tab is removed
 *      (wiring `analytics_events.talent_id` end-to-end is future work).
 *
 * THE FUNNEL HERE IS THE WEBSITE-VISITS FUNNEL
 * ────────────────────────────────────────────
 * visits → inquiries → confirmed bookings, all counted over the same trailing
 * window. It is NOT the inquiry-stage funnel the ConversionFunnelDrawer shows
 * (that one tracks inquiry pipeline stages); the heading and info tip say so.
 *
 * STYLING — token classes only (`ratchet/no-new-inline-style`). Nothing was
 * moved from the old inline-styled panel; every block here is rebuilt. The
 * trend chart is dependency-free SVG (presentation attributes, no style prop,
 * no chart library).
 */

import { useMemo, useState } from "react";

import { useT } from "@/i18n/use-t";
import { interpolate } from "@/i18n/interpolate";
import { InfoTip } from "@/components/ui/info-tip";

import { useAdminShell } from "../state";
import type {
  WebsiteAnalytics,
  WebsiteDailyVisits,
  WebsitePageRow,
  WebsitePeriodMetrics,
} from "../state";
import { PageHeader } from "./pages-shared";
import { formatPageUpdatedAt } from "./WebsitePage-2";

type Period = "7d" | "30d";

// USD, always. The platform prices and reports in USD (see
// feedback_primary_currency_usd + the "never a hardcoded €" note in
// IdentityBar-1); this helper was carried over from the old Performance panel
// with a euro sign baked in, which rendered "€0" on every tenant's Analytics.
const fmtMoney = (n: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(n);

/** Pill period switcher — 7d / 30d. */
function PeriodSwitch({
  period,
  onChange,
}: {
  period: Period;
  onChange: (p: Period) => void;
}) {
  const t = useT();
  return (
    <div className="inline-flex rounded-full border border-admin-border-soft bg-admin-surface-alt p-[3px]">
      {(["7d", "30d"] as const).map((p) => {
        const active = p === period;
        return (
          <button
            key={p}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(p)}
            className={`cursor-pointer rounded-full border-none px-[12px] py-[5px] text-admin-11h font-semibold ${
              active ? "bg-admin-card text-admin-ink shadow-sm" : "bg-transparent text-admin-ink-muted"
            }`}
          >
            {p === "7d" ? t("dashboard.adminWebsite.period7days") : t("dashboard.adminWebsite.period30days")}
          </button>
        );
      })}
    </div>
  );
}

/**
 * One KPI tile. The delta line renders ONLY when a prior window exists
 * (7d period); with `prior === null` (30d period) the tile shows the value
 * alone rather than a fabricated comparison.
 */
function KpiTile({
  label,
  value,
  current,
  prior,
  accent,
  fmtPriorValue,
}: {
  label: string;
  value: string;
  current: number;
  /** The prior-window value for this metric, or null = no baseline. */
  prior: number | null;
  accent?: boolean;
  fmtPriorValue?: (n: number) => string;
}) {
  const t = useT();
  let deltaLine: React.ReactNode = null;
  if (prior !== null) {
    const priorLabel = fmtPriorValue ? fmtPriorValue(prior) : prior.toLocaleString();
    if (prior > 0) {
      const delta = ((current - prior) / prior) * 100;
      const dir = Math.abs(delta) < 0.5 ? "flat" : delta > 0 ? "up" : "down";
      const tone =
        dir === "up"
          ? "text-admin-success-deep"
          : dir === "down"
            ? "text-admin-critical"
            : "text-admin-ink-muted";
      deltaLine = (
        <div className={`mt-[2px] text-admin-11 ${tone}`}>
          {dir === "up" ? "↑" : dir === "down" ? "↓" : "→"} {Math.abs(delta).toFixed(1)}%
          <span className="ml-[4px] text-admin-ink-dim">
            {interpolate(t("dashboard.adminWebsite.vsPrior"), { prior: priorLabel })}
          </span>
        </div>
      );
    } else {
      // A percentage against a prior of 0 is undefined — say "new" instead of
      // inventing an infinity or a fake flat line.
      deltaLine = (
        <div className="mt-[2px] text-admin-11 text-admin-ink-dim">
          {current > 0
            ? t("dashboard.adminWebsite.analyticsDeltaNew")
            : interpolate(t("dashboard.adminWebsite.vsPrior"), { prior: priorLabel })}
        </div>
      );
    }
  }
  return (
    <div
      className={`rounded-admin-md border p-[14px] ${
        accent
          ? "border-admin-border bg-admin-accent-soft"
          : "border-admin-border-soft bg-admin-card"
      }`}
    >
      <div className="text-admin-10 font-bold uppercase tracking-[0.6px] text-admin-ink-muted">{label}</div>
      <div className={`mt-[4px] font-admin-display text-admin-22 font-semibold tabular-nums tracking-[-0.3px] ${accent ? "text-admin-accent-deep" : "text-admin-ink"}`}>
        {value}
      </div>
      {deltaLine}
    </div>
  );
}

/**
 * Dependency-free per-day visits chart. Plain SVG bars: geometry lives in
 * presentation attributes (allowed), color comes from `currentColor` via the
 * wrapper's token class — no style props, no chart library.
 */
function DailyVisitsChart({ days }: { days: WebsiteDailyVisits[] }) {
  const t = useT();
  const { locale } = useAdminShell();
  if (days.length === 0 || days.every((d) => d.visits === 0)) {
    return (
      <div className="rounded-admin-sm border border-admin-border-soft px-[14px] py-[16px] text-center text-admin-12h text-admin-ink-muted">
        {t("dashboard.adminWebsite.analyticsTrendEmpty")}
      </div>
    );
  }
  const max = Math.max(...days.map((d) => d.visits), 1);
  const BAR = 8;
  const GAP = 3;
  const H = 96;
  const width = days.length * (BAR + GAP) - GAP;
  const fmtDay = (iso: string) => {
    try {
      return new Intl.DateTimeFormat(locale, { month: "short", day: "numeric", timeZone: "UTC" }).format(
        new Date(`${iso}T00:00:00.000Z`),
      );
    } catch {
      return iso;
    }
  };
  return (
    <div>
      <div className="text-admin-indigo-deep">
        <svg
          viewBox={`0 0 ${width} ${H}`}
          className="block h-[96px] w-full"
          preserveAspectRatio="none"
          role="img"
          aria-label={t("dashboard.adminWebsite.analyticsTrendHeading")}
        >
          {days.map((d, i) => {
            // Minimum 1.5-unit sliver so a nonzero day is never invisible;
            // a true zero day renders no bar at all.
            const h = d.visits === 0 ? 0 : Math.max((d.visits / max) * H, 1.5);
            return (
              <rect
                key={d.date}
                x={i * (BAR + GAP)}
                y={H - h}
                width={BAR}
                height={h}
                rx={1.5}
                fill="currentColor"
                opacity={0.85}
              >
                <title>{`${fmtDay(d.date)} · ${d.visits.toLocaleString()}`}</title>
              </rect>
            );
          })}
        </svg>
      </div>
      <div className="mt-[6px] flex items-baseline justify-between text-admin-10 font-semibold uppercase tracking-[0.5px] text-admin-ink-dim">
        <span>{fmtDay(days[0]!.date)}</span>
        <span className="normal-case tracking-normal text-admin-ink-muted">
          {interpolate(t("dashboard.adminWebsite.analyticsTrendPeak"), { count: max.toLocaleString() })}
        </span>
        <span>{fmtDay(days[days.length - 1]!.date)}</span>
      </div>
    </div>
  );
}

function FunnelStep({ label, value }: { label: string; value: string }) {
  return (
    <div className="text-center text-admin-indigo-deep">
      <div className="font-admin-display text-admin-22 font-semibold tabular-nums tracking-[-0.3px]">{value}</div>
      <div className="text-admin-10 font-bold uppercase tracking-[0.6px] opacity-70">{label}</div>
    </div>
  );
}

function FunnelRate({ rate, caption }: { rate: number; caption: string }) {
  return (
    <div className="text-center text-admin-indigo-deep">
      <div className="font-mono text-admin-13 font-semibold">{rate.toFixed(2)}%</div>
      <div className="text-admin-10 opacity-70">{caption}</div>
    </div>
  );
}

/** Section card — heading, helper, optional trailing node. */
function AnalyticsSection({
  heading,
  info,
  trailing,
  children,
}: {
  heading: string;
  info?: string;
  trailing?: React.ReactNode;
  children: React.ReactNode;
}) {
  const t = useT();
  return (
    <section className="rounded-admin-lg border border-admin-border bg-admin-card p-[16px]">
      <div className="mb-[12px] flex flex-wrap items-center gap-x-[8px] gap-y-[4px]">
        <h2 className="m-0 text-admin-15 font-semibold text-admin-ink">{heading}</h2>
        {info ? (
          <InfoTip
            label={info}
            triggerLabel={t("dashboard.adminWebsite.designHub.whatIsThis")}
            placement="bottom-start"
            className="text-admin-ink-dim hover:text-admin-ink"
          />
        ) : null}
        {trailing ? <span className="ml-auto">{trailing}</span> : null}
      </div>
      {children}
    </section>
  );
}

export function WebsiteAnalyticsPage() {
  const t = useT();
  const { effectiveWebsiteState, locale } = useAdminShell();
  const w = effectiveWebsiteState;
  const analytics: WebsiteAnalytics = w.analytics;
  const [period, setPeriod] = useState<Period>("7d");

  const m: WebsitePeriodMetrics = period === "7d" ? analytics.last7d : analytics.last30d;
  const byPage = period === "7d" ? analytics.byPage7d : analytics.byPage30d;
  const byReferrer = period === "7d" ? analytics.topReferrers7d : analytics.topReferrers30d;
  const trendDays = period === "7d" ? analytics.visitsByDay.slice(-7) : analytics.visitsByDay;

  const v2i = m.visits > 0 ? (m.inquiries / m.visits) * 100 : 0;
  const i2b = m.inquiries > 0 ? (m.bookings / m.inquiries) * 100 : 0;
  const overallConv = m.visits > 0 ? (m.bookings / m.visits) * 100 : 0;

  // Full 8 rows the grouper returns (the old panel truncated to 4).
  const topPages = useMemo(
    () =>
      byPage
        .filter((p) => p.visits > 0)
        .sort((a, b) => b.visits - a.visits)
        .map((p) => ({
          ...p,
          title:
            w.pages.find((pg: WebsitePageRow) => pg.id === p.pageId)?.title ??
            w.pages.find((pg: WebsitePageRow) => pg.slug === p.pageSlug)?.title ??
            p.pageSlug,
        })),
    [byPage, w.pages],
  );

  const topReferrers = byReferrer.filter((r) => r.visits > 0);
  const referrerTotal = topReferrers.reduce((sum, r) => sum + r.visits, 0);

  const updatedWhen = formatPageUpdatedAt(analytics.refreshedAt, t, locale);

  return (
    <>
      <PageHeader
        title={t("dashboard.adminWebsite.nav.analyticsLabel")}
        subtitle={t("dashboard.adminWebsite.analyticsSubtitle")}
        actions={
          updatedWhen ? (
            <span className="text-admin-11 text-admin-ink-dim">
              {interpolate(t("dashboard.adminWebsite.analyticsUpdated"), { when: updatedWhen })}
            </span>
          ) : undefined
        }
      />

      <div className="mb-[14px] flex items-center justify-end">
        <PeriodSwitch period={period} onChange={setPeriod} />
      </div>

      <div className="flex flex-col gap-[14px]">
        {/* KPI tiles — deltas only where a real baseline exists (7d). */}
        <div>
          <div className="grid grid-cols-[repeat(auto-fit,minmax(160px,1fr))] gap-[12px]">
            <KpiTile
              label={t("dashboard.adminWebsite.tileVisits")}
              value={m.visits.toLocaleString()}
              current={m.visits}
              prior={m.prior ? m.prior.visits : null}
            />
            <KpiTile
              label={t("dashboard.adminWebsite.tileInquiries")}
              value={m.inquiries.toLocaleString()}
              current={m.inquiries}
              prior={m.prior ? m.prior.inquiries : null}
            />
            <KpiTile
              label={t("dashboard.adminWebsite.tileBookings")}
              value={m.bookings.toLocaleString()}
              current={m.bookings}
              prior={m.prior ? m.prior.bookings : null}
            />
            <KpiTile
              label={t("dashboard.adminWebsite.tileBookingRevenue")}
              value={fmtMoney(m.revenue)}
              current={m.revenue}
              prior={m.prior ? m.prior.revenue : null}
              accent
              fmtPriorValue={fmtMoney}
            />
          </div>
          {m.prior === null ? (
            <p className="mb-0 mt-[8px] text-admin-11 text-admin-ink-dim">
              {t("dashboard.adminWebsite.analyticsNo30dDelta")}
            </p>
          ) : null}
        </div>

        {/* Daily visits trend — derived from real event timestamps. */}
        <AnalyticsSection heading={t("dashboard.adminWebsite.analyticsTrendHeading")}>
          <DailyVisitsChart days={trendDays} />
        </AnalyticsSection>

        {/* Website-visits funnel — NOT the inquiry-stage pipeline funnel. */}
        <AnalyticsSection
          heading={t("dashboard.adminWebsite.analyticsFunnelHeading")}
          info={t("dashboard.adminWebsite.analyticsFunnelInfo")}
        >
          <div className="grid grid-cols-[1fr_auto_1fr_auto_1fr] items-center gap-[12px] rounded-admin-md bg-admin-indigo-soft px-[16px] py-[14px]">
            <FunnelStep label={t("dashboard.adminWebsite.funnelVisits")} value={m.visits.toLocaleString()} />
            <FunnelRate rate={v2i} caption={t("dashboard.adminWebsite.funnelVisitToInquiry")} />
            <FunnelStep label={t("dashboard.adminWebsite.funnelInquiries")} value={m.inquiries.toLocaleString()} />
            <FunnelRate rate={i2b} caption={t("dashboard.adminWebsite.funnelInquiryToBooking")} />
            <FunnelStep label={t("dashboard.adminWebsite.funnelBookings")} value={m.bookings.toLocaleString()} />
            <div className="col-span-full mt-[4px] flex items-center justify-between border-t border-admin-border-soft pt-[10px] text-admin-indigo-deep">
              <span className="text-admin-10 font-semibold uppercase tracking-[0.6px]">
                {t("dashboard.adminWebsite.overallConversion")}
              </span>
              <span className="font-mono text-admin-13 font-semibold">
                {overallConv.toFixed(2)}%
                <span className="ml-[6px] text-admin-11 opacity-60">
                  {interpolate(t("dashboard.adminWebsite.conversionOfVisits"), {
                    bookings: m.bookings,
                    visits: m.visits.toLocaleString(),
                  })}
                </span>
              </span>
            </div>
          </div>
        </AnalyticsSection>

        {/* Top pages — real visits + surfaces. No per-page inquiry/booking
            columns: no per-page attribution exists, so none is claimed. */}
        <AnalyticsSection heading={t("dashboard.adminWebsite.analyticsTopPagesHeading")}>
          {topPages.length === 0 ? (
            <div className="rounded-admin-sm border border-admin-border-soft px-[14px] py-[16px] text-center text-admin-12h text-admin-ink-muted">
              {t("dashboard.adminWebsite.topEmptyPages")}
            </div>
          ) : (
            <div className="overflow-hidden rounded-admin-sm border border-admin-border-soft">
              <div className="grid grid-cols-[1.6fr_1fr_0.6fr] border-b border-admin-border-soft bg-admin-surface-alt px-[14px] py-[8px] text-admin-10 font-semibold uppercase tracking-[0.5px] text-admin-ink-muted">
                <div>{t("dashboard.adminWebsite.thPage")}</div>
                <div>{t("dashboard.adminWebsite.analyticsThSurfaces")}</div>
                <div className="text-right">{t("dashboard.adminWebsite.thVisits")}</div>
              </div>
              {topPages.map((p, i) => (
                <div
                  key={`${p.pageId}-${p.pageSlug}`}
                  className={`grid grid-cols-[1.6fr_1fr_0.6fr] items-center px-[14px] py-[10px] text-admin-13 text-admin-ink ${i === 0 ? "" : "border-t border-admin-border-soft"}`}
                >
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate font-semibold">{p.title}</span>
                    <span className="truncate font-mono text-admin-11 text-admin-ink-dim">{p.pageSlug}</span>
                  </span>
                  <span className="flex flex-wrap gap-[4px]">
                    {p.surfaces.map((s) => (
                      <span
                        key={s}
                        className="rounded-full bg-admin-surface-alt px-[8px] py-[2px] text-admin-10 font-semibold text-admin-ink-muted"
                      >
                        {s}
                      </span>
                    ))}
                  </span>
                  <span className="text-right tabular-nums">{p.visits.toLocaleString()}</span>
                </div>
              ))}
            </div>
          )}
        </AnalyticsSection>

        {/* Top referrers — full 8 rows the grouper returns. */}
        <AnalyticsSection heading={t("dashboard.adminWebsite.analyticsTopReferrersHeading")}>
          {topReferrers.length === 0 ? (
            <div className="rounded-admin-sm border border-admin-border-soft px-[14px] py-[16px] text-center text-admin-12h text-admin-ink-muted">
              {t("dashboard.adminWebsite.topEmptyReferrers")}
            </div>
          ) : (
            <div className="overflow-hidden rounded-admin-sm border border-admin-border-soft">
              <div className="grid grid-cols-[2fr_1fr_1fr] border-b border-admin-border-soft bg-admin-surface-alt px-[14px] py-[8px] text-admin-10 font-semibold uppercase tracking-[0.5px] text-admin-ink-muted">
                <div>{t("dashboard.adminWebsite.thReferrer")}</div>
                <div className="text-right">{t("dashboard.adminWebsite.thVisits")}</div>
                <div className="text-right">{t("dashboard.adminWebsite.thShare")}</div>
              </div>
              {topReferrers.map((r, i) => {
                const share = referrerTotal > 0 ? (r.visits / referrerTotal) * 100 : 0;
                return (
                  <div
                    key={r.referrer}
                    className={`grid grid-cols-[2fr_1fr_1fr] items-center px-[14px] py-[10px] text-admin-13 text-admin-ink ${i === 0 ? "" : "border-t border-admin-border-soft"}`}
                  >
                    <span className="truncate font-semibold">
                      {r.referrer === "direct" ? t("dashboard.adminWebsite.referrerDirect") : r.referrer}
                    </span>
                    <span className="text-right tabular-nums">{r.visits.toLocaleString()}</span>
                    <span className="text-right tabular-nums text-admin-ink-muted">{share.toFixed(1)}%</span>
                  </div>
                );
              })}
            </div>
          )}
        </AnalyticsSection>
      </div>
    </>
  );
}
