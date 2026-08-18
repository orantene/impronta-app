"use client";

import { useState } from "react";
import { useT } from "@/i18n/use-t";
import { interpolate } from "@/i18n/interpolate";
import { COLORS, FONTS } from "../state";
import type { WebsiteAnalytics, WebsitePageRow, WebsitePeriodMetrics } from "../state";

const MIN_MS = 60_000;
const HOUR_MS = 60 * MIN_MS;
const DAY_MS = 24 * HOUR_MS;
const WEEK_MS = 7 * DAY_MS;

/**
 * Short, locale-aware absolute date ("Jul 9", or "Jul 9, 2025" across a
 * year boundary). Shared tail of the relative-timestamp formatters below,
 * and reused directly wherever a plain absolute date is enough (e.g. the
 * Website hero's "next scheduled" stat).
 */
export function formatShortDate(iso: string, locale: string): string {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return "";
  const sameYear = new Date(then).getFullYear() === new Date().getFullYear();
  try {
    return new Intl.DateTimeFormat(locale, {
      month: "short",
      day: "numeric",
      year: sameYear ? undefined : "numeric",
    }).format(then);
  } catch {
    return new Date(then).toDateString();
  }
}

/**
 * Short, locale-aware "updated" timestamp for a page card (W1-L9 polish —
 * cards previously showed the raw ISO timestamp verbatim). Relative for the
 * first week ("2h ago", "3d ago" — same convention as Inbox/Pitches), then
 * falls back to `formatShortDate`.
 */
export function formatPageUpdatedAt(
  iso: string,
  t: (key: string) => string,
  locale: string,
): string {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return "";
  const diff = Math.max(0, Date.now() - then);
  if (diff < MIN_MS) return t("dashboard.adminWebsite.relJustNow");
  if (diff < HOUR_MS) return interpolate(t("dashboard.adminWebsite.relMinsAgo"), { count: Math.round(diff / MIN_MS) });
  if (diff < DAY_MS) return interpolate(t("dashboard.adminWebsite.relHoursAgo"), { count: Math.round(diff / HOUR_MS) });
  if (diff < WEEK_MS) return interpolate(t("dashboard.adminWebsite.relDaysAgo"), { count: Math.round(diff / DAY_MS) });
  return formatShortDate(iso, locale);
}

/**
 * Locale-aware "publishes at" string for a scheduled page card. Mirror of
 * `formatPageUpdatedAt` but for a FUTURE timestamp: relative buckets
 * ("in 2h", "in 3d") for the first week, then a short absolute date. This
 * is what makes the Scheduled tab informative rather than just a filter —
 * see the admin Website → Pages "Scheduled" tab fix.
 */
export function formatScheduledPublishAt(
  iso: string,
  t: (key: string) => string,
  locale: string,
): string {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return "";
  const diff = then - Date.now();
  if (diff <= MIN_MS) return t("dashboard.adminWebsite.pageCardPublishesSoon");
  if (diff < HOUR_MS) return interpolate(t("dashboard.adminWebsite.pageCardPublishesInMins"), { count: Math.round(diff / MIN_MS) });
  if (diff < DAY_MS) return interpolate(t("dashboard.adminWebsite.pageCardPublishesInHours"), { count: Math.round(diff / HOUR_MS) });
  if (diff < WEEK_MS) return interpolate(t("dashboard.adminWebsite.pageCardPublishesInDays"), { count: Math.round(diff / DAY_MS) });
  return interpolate(t("dashboard.adminWebsite.pageCardPublishesOn"), { date: formatShortDate(iso, locale) });
}

export function HeroStat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div>
      <div style={{ fontFamily: FONTS.display, fontSize: 26, fontWeight: 600, color: "#fff", letterSpacing: -0.5, lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>{value}</div>
      <div style={{ fontSize: 11, color: "rgba(255,255,255,0.6)", marginTop: 4, fontWeight: 500, letterSpacing: 0.2 }}>
        {label}
        {sub && <span style={{ marginLeft: 4, opacity: 0.7 }}>· {sub}</span>}
      </div>
    </div>
  );
}

export function ConfigStatusRow({ label, status, value }: { label: string; status: "ok" | "warn"; value: string }) {
  const dot = status === "ok" ? COLORS.successDeep : COLORS.amberDeep;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, fontFamily: FONTS.body }}>
      <span style={{ width: 6, height: 6, borderRadius: "50%", background: dot, flexShrink: 0 }} />
      <span style={{ color: COLORS.inkMuted, fontWeight: 600, letterSpacing: 0.3, textTransform: "uppercase", fontSize: 10.5, minWidth: 60 }}>{label}</span>
      <span style={{ fontWeight: 500, marginLeft: "auto", textAlign: "right", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} className="text-admin-ink">{value}</span>
    </div>
  );
}

// Hoisted from inside WebsitePerformance (Q4). Pure aside from fmtPrior,
// which is lifted to a prop so the booking-revenue tile can pass fmtMoney.
function Tile({ label, value, current, prior, accent, fmtPrior, isMoney }: { label: string; value: string; current: number; prior: number; accent?: boolean; fmtPrior?: (n: number) => string; isMoney?: boolean }) {
  const t = useT();
  const delta = prior > 0 ? ((current - prior) / prior) * 100 : 0;
  const dir = Math.abs(delta) < 0.5 ? "flat" : (delta > 0 ? "up" : "down");
  const color = dir === "up" ? COLORS.successDeep : dir === "down" ? COLORS.criticalDeep : COLORS.inkMuted;
  const priorLabel = fmtPrior && typeof prior === "number" && prior > 1000 && isMoney
    ? fmtPrior(prior)
    : prior.toLocaleString();
  return (
    <div style={{ padding: 14, borderRadius: 10, background: accent ? COLORS.accentSoft : "#fff", border: `1px solid ${accent ? "rgba(15,79,62,0.24)" : COLORS.borderSoft}` }}>
      <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: 0.6, textTransform: "uppercase" }} className="text-admin-ink-muted">{label}</div>
      <div style={{ fontFamily: FONTS.display, fontSize: 24, fontWeight: 600, color: accent ? COLORS.accentDeep : COLORS.ink, marginTop: 4, fontVariantNumeric: "tabular-nums", letterSpacing: -0.3 }}>{value}</div>
      <div style={{ fontSize: 11, color, marginTop: 2 }}>
        {dir === "up" ? "↑" : dir === "down" ? "↓" : "→"} {Math.abs(delta).toFixed(1)}%
        <span style={{ marginLeft: 4 }} className="text-admin-ink-dim">{interpolate(t("dashboard.adminWebsite.vsPrior"), { prior: priorLabel })}</span>
      </div>
    </div>
  );
}

export function WebsitePerformance({ analytics, pages, fmtMoney }: { analytics: WebsiteAnalytics; pages: WebsitePageRow[]; fmtMoney: (n: number) => string }) {
  const t = useT();
  const [period, setPeriod] = useState<"7d" | "30d">("7d");
  const [topView, setTopView] = useState<"pages" | "talent" | "referrers">("pages");
  const m: WebsitePeriodMetrics = period === "7d" ? analytics.last7d : analytics.last30d;
  const byPage = period === "7d" ? analytics.byPage7d : analytics.byPage30d;
  const byTalent = period === "7d" ? analytics.byTalent7d : analytics.byTalent30d;
  // ANALYTICS-2 — top referrers (host) from the real view_site_page payload.
  const byReferrer = period === "7d" ? analytics.topReferrers7d : analytics.topReferrers30d;
  const topReferrers = byReferrer.filter(r => r.visits > 0).slice(0, 6);
  const overallConv = m.visits > 0 ? (m.bookings / m.visits) * 100 : 0;
  const v2i = m.visits > 0 ? (m.inquiries / m.visits) * 100 : 0;
  const i2b = m.inquiries > 0 ? (m.bookings / m.inquiries) * 100 : 0;

  const topPages = byPage
    .filter(p => p.visits > 0)
    .sort((a, b) => b.visits - a.visits)
    .slice(0, 4)
    // ANALYTICS-2 — title resolves by page id, then by slug (talent-site rows
    // may key only on slug), then falls back to the raw page key.
    .map(p => ({
      ...p,
      title:
        pages.find(pg => pg.id === p.pageId)?.title ??
        pages.find(pg => pg.slug === p.pageId)?.title ??
        p.pageId,
    }));

  const topTalent = byTalent
    .filter(tl => tl.visits > 0)
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 4)
    .map(tl => ({ ...tl, topPageTitle: pages.find(pg => pg.id === tl.topPageId)?.title ?? "—" }));

  return (
    <section style={{ marginBottom: 18 }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 8, flexWrap: "wrap" }}>
        <h2 style={{ margin: 0, fontFamily: FONTS.display, fontSize: 18, fontWeight: 600, letterSpacing: -0.2 }} className="text-admin-ink">{t("dashboard.adminWebsite.performanceHeading")}</h2>
        <span style={{ fontSize: 11.5, fontFamily: FONTS.body }} className="text-admin-ink-muted">{interpolate(t("dashboard.adminWebsite.vsPriorPeriod"), { period })}</span>
        <div style={{ marginLeft: "auto", display: "inline-flex", border: `1px solid ${COLORS.borderSoft}`, borderRadius: 999, padding: 3, fontFamily: FONTS.body }} className="bg-admin-surface-alt">
          {(["7d", "30d"] as const).map(p => {
            const active = p === period;
            return (
              <button key={p} type="button" onClick={() => setPeriod(p)} style={{ padding: "5px 12px", fontSize: 11.5, fontWeight: 600, letterSpacing: 0.2, borderRadius: 999, border: "none", cursor: "pointer", background: active ? "#fff" : "transparent", color: active ? COLORS.ink : COLORS.inkMuted, boxShadow: active ? "0 1px 3px rgba(0,0,0,0.06)" : "none", transition: "all 120ms ease" }}>{p === "7d" ? t("dashboard.adminWebsite.period7days") : t("dashboard.adminWebsite.period30days")}</button>
            );
          })}
        </div>
      </div>

      <div style={{ background: "#fff", border: `1px solid ${COLORS.borderSoft}`, borderRadius: 14, padding: 18, display: "flex", flexDirection: "column", gap: 18 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 14 }}>
          <Tile label={t("dashboard.adminWebsite.tileVisits")}           value={m.visits.toLocaleString()}   current={m.visits}    prior={m.prior.visits} />
          <Tile label={t("dashboard.adminWebsite.tileInquiries")}        value={m.inquiries.toLocaleString()} current={m.inquiries} prior={m.prior.inquiries} />
          <Tile label={t("dashboard.adminWebsite.tileBookings")}         value={m.bookings.toLocaleString()} current={m.bookings}  prior={m.prior.bookings} />
          <Tile label={t("dashboard.adminWebsite.tileBookingRevenue")}  value={fmtMoney(m.revenue)}          current={m.revenue}   prior={m.prior.revenue}  accent fmtPrior={fmtMoney} isMoney />
        </div>

        {/* Funnel strip */}
        <div style={{ border: "1px solid rgba(91,107,160,0.18)", borderRadius: 10, padding: "14px 16px", display: "grid", gridTemplateColumns: "1fr auto 1fr auto 1fr", alignItems: "center", gap: 12 }} className="bg-admin-indigo-soft">
          <FunnelStep label={t("dashboard.adminWebsite.funnelVisits")}     value={m.visits.toLocaleString()} />
          <FunnelArrow rate={v2i} caption={t("dashboard.adminWebsite.funnelVisitToInquiry")} />
          <FunnelStep label={t("dashboard.adminWebsite.funnelInquiries")}  value={m.inquiries.toLocaleString()} />
          <FunnelArrow rate={i2b} caption={t("dashboard.adminWebsite.funnelInquiryToBooking")} />
          <FunnelStep label={t("dashboard.adminWebsite.funnelBookings")}   value={m.bookings.toLocaleString()} />
          <div style={{ gridColumn: "1 / -1", paddingTop: 10, marginTop: 4, borderTop: "1px solid rgba(91,107,160,0.18)", display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 11.5, fontFamily: FONTS.body }} className="text-admin-indigo-deep">
            <span style={{ fontWeight: 600, textTransform: "uppercase", fontSize: 10.5, letterSpacing: 0.6 }}>{t("dashboard.adminWebsite.overallConversion")}</span>
            <span style={{ fontFamily: "ui-monospace, monospace", fontWeight: 600, fontSize: 13 }}>{overallConv.toFixed(2)}%
              <span style={{ marginLeft: 6, opacity: 0.6, fontSize: 11 }}>{interpolate(t("dashboard.adminWebsite.conversionOfVisits"), { bookings: m.bookings, visits: m.visits.toLocaleString() })}</span>
            </span>
          </div>
        </div>

        {/* Top performers — Pages | Talent switcher */}
        <div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10, flexWrap: "wrap", gap: 8 }}>
            <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: 0.6, textTransform: "uppercase", fontFamily: FONTS.body }} className="text-admin-ink-muted">{t("dashboard.adminWebsite.topPerformers")}</div>
            <div style={{ display: "inline-flex", border: `1px solid ${COLORS.borderSoft}`, borderRadius: 999, padding: 3, fontFamily: FONTS.body }} className="bg-admin-surface-alt">
              {(["pages", "talent", "referrers"] as const).map(v => {
                const active = topView === v;
                const label = v === "pages" ? t("dashboard.adminWebsite.topViewPages") : v === "talent" ? t("dashboard.adminWebsite.topViewTalent") : t("dashboard.adminWebsite.topViewReferrers");
                return (
                  <button key={v} type="button" onClick={() => setTopView(v)} style={{ padding: "5px 14px", fontSize: 11.5, fontWeight: 600, letterSpacing: 0.2, borderRadius: 999, border: "none", cursor: "pointer", background: active ? "#fff" : "transparent", color: active ? COLORS.ink : COLORS.inkMuted, boxShadow: active ? "0 1px 3px rgba(0,0,0,0.06)" : "none", transition: "all 120ms ease" }}>{label}</button>
                );
              })}
            </div>
          </div>

          {topView === "pages" && topPages.length > 0 && (
            <div style={{ border: `1px solid ${COLORS.borderSoft}`, borderRadius: 10, overflow: "hidden" }}>
              <div style={{ display: "grid", gridTemplateColumns: "1.5fr 1fr 1fr 1fr 1fr", padding: "8px 14px", borderBottom: `1px solid ${COLORS.borderSoft}`, fontSize: 10.5, fontWeight: 600, letterSpacing: 0.5, textTransform: "uppercase", fontFamily: FONTS.body }} className="bg-admin-surface-alt text-admin-ink-muted">
                <div>{t("dashboard.adminWebsite.thPage")}</div>
                <div className="text-right">{t("dashboard.adminWebsite.thVisits")}</div>
                <div className="text-right">{t("dashboard.adminWebsite.thInquiries")}</div>
                <div className="text-right">{t("dashboard.adminWebsite.thBookings")}</div>
                <div className="text-right">{t("dashboard.adminWebsite.thConvRate")}</div>
              </div>
              {topPages.map((p, i) => {
                const conv = p.visits > 0 ? (p.bookings / p.visits) * 100 : 0;
                const tone = (overallConv > 0 && conv >= overallConv) ? COLORS.successDeep : conv > 0 ? COLORS.indigoDeep : COLORS.inkDim;
                return (
                  <div key={p.pageId} style={{ display: "grid", gridTemplateColumns: "1.5fr 1fr 1fr 1fr 1fr", padding: "10px 14px", alignItems: "center", borderTop: i === 0 ? "none" : `1px solid ${COLORS.borderSoft}`, fontSize: 13, color: COLORS.ink, fontFamily: FONTS.body }}>
                    <span className="font-semibold">{p.title}</span>
                    <span style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{p.visits.toLocaleString()}</span>
                    <span style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{p.inquiries}</span>
                    <span style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{p.bookings}</span>
                    <span style={{ textAlign: "right", fontVariantNumeric: "tabular-nums", fontWeight: 600, color: tone }}>{conv.toFixed(2)}%</span>
                  </div>
                );
              })}
            </div>
          )}

          {topView === "talent" && topTalent.length > 0 && (
            <div style={{ border: `1px solid ${COLORS.borderSoft}`, borderRadius: 10, overflow: "hidden" }}>
              <div style={{ display: "grid", gridTemplateColumns: "1.5fr 1fr 1fr 1fr 1fr 1.2fr", padding: "8px 14px", borderBottom: `1px solid ${COLORS.borderSoft}`, fontSize: 10.5, fontWeight: 600, letterSpacing: 0.5, textTransform: "uppercase", fontFamily: FONTS.body }} className="bg-admin-surface-alt text-admin-ink-muted">
                <div>{t("dashboard.adminWebsite.thTalent")}</div>
                <div className="text-right">{t("dashboard.adminWebsite.thVisits")}</div>
                <div className="text-right">{t("dashboard.adminWebsite.thInquiries")}</div>
                <div className="text-right">{t("dashboard.adminWebsite.thBookings")}</div>
                <div className="text-right">{t("dashboard.adminWebsite.thRevenue")}</div>
                <div className="text-right">{t("dashboard.adminWebsite.thTopPage")}</div>
              </div>
              {topTalent.map((tl, i) => {
                const conv = tl.visits > 0 ? (tl.bookings / tl.visits) * 100 : 0;
                const tone = (overallConv > 0 && conv >= overallConv) ? COLORS.successDeep : tl.revenue > 0 ? COLORS.indigoDeep : COLORS.inkDim;
                return (
                  <div key={tl.talentId} style={{ display: "grid", gridTemplateColumns: "1.5fr 1fr 1fr 1fr 1fr 1.2fr", padding: "10px 14px", alignItems: "center", borderTop: i === 0 ? "none" : `1px solid ${COLORS.borderSoft}`, fontSize: 13, color: COLORS.ink, fontFamily: FONTS.body }}>
                    <span className="flex flex-col gap-0.5">
                      <span className="font-semibold">{tl.talentName}</span>
                      <span className="text-admin-ink-dim text-admin-11">{conv > 0 ? interpolate(t("dashboard.adminWebsite.convSuffix"), { pct: conv.toFixed(2) }) : t("dashboard.adminWebsite.noBookings")}</span>
                    </span>
                    <span style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{tl.visits.toLocaleString()}</span>
                    <span style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{tl.inquiries}</span>
                    <span style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{tl.bookings}</span>
                    <span style={{ textAlign: "right", fontVariantNumeric: "tabular-nums", fontWeight: 600, color: tone }}>{fmtMoney(tl.revenue)}</span>
                    <span style={{ textAlign: "right", fontSize: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} className="text-admin-ink-muted">{tl.topPageTitle}</span>
                  </div>
                );
              })}
            </div>
          )}

          {/* ANALYTICS-2 — top-referrers table. Rendered with Tailwind admin
              tokens only (no inline style) so the frozen no-new-inline-style
              ratchet under components/admin/shell stays at its baseline. */}
          {topView === "referrers" && topReferrers.length > 0 && (
            <div className="overflow-hidden rounded-[10px] border border-admin-border-soft">
              <div className="grid grid-cols-[2fr_1fr_1fr] border-b border-admin-border-soft bg-admin-surface-alt px-3.5 py-2 text-admin-10 font-semibold uppercase tracking-[0.5px] text-admin-ink-muted">
                <div>{t("dashboard.adminWebsite.thReferrer")}</div>
                <div className="text-right">{t("dashboard.adminWebsite.thVisits")}</div>
                <div className="text-right">{t("dashboard.adminWebsite.thShare")}</div>
              </div>
              {topReferrers.map((r, i) => {
                const total = topReferrers.reduce((sum, x) => sum + x.visits, 0);
                const share = total > 0 ? (r.visits / total) * 100 : 0;
                return (
                  <div
                    key={r.referrer}
                    className={`grid grid-cols-[2fr_1fr_1fr] items-center px-3.5 py-2.5 text-admin-13 text-admin-ink ${i === 0 ? "" : "border-t border-admin-border-soft"}`}
                  >
                    <span className="truncate font-semibold">{r.referrer === "direct" ? t("dashboard.adminWebsite.referrerDirect") : r.referrer}</span>
                    <span className="text-right tabular-nums">{r.visits.toLocaleString()}</span>
                    <span className="text-right tabular-nums text-admin-ink-muted">{share.toFixed(1)}%</span>
                  </div>
                );
              })}
            </div>
          )}

          {((topView === "pages" && topPages.length === 0) ||
            (topView === "talent" && topTalent.length === 0) ||
            (topView === "referrers" && topReferrers.length === 0)) && (
            <div className="rounded-[10px] border border-admin-border-soft px-3.5 py-4 text-center text-admin-12 text-admin-ink-muted">
              {topView === "pages" ? t("dashboard.adminWebsite.topEmptyPages") : topView === "talent" ? t("dashboard.adminWebsite.topEmptyTalent") : t("dashboard.adminWebsite.topEmptyReferrers")}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function FunnelStep({ label, value }: { label: string; value: string }) {
  return (
    <div className="text-center">
      <div style={{ fontFamily: FONTS.display, fontSize: 22, fontWeight: 600, fontVariantNumeric: "tabular-nums", letterSpacing: -0.3 }} className="text-admin-indigo-deep">{value}</div>
      <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: 0.6, textTransform: "uppercase", opacity: 0.7 }} className="text-admin-indigo-deep">{label}</div>
    </div>
  );
}
function FunnelArrow({ rate, caption }: { rate: number; caption: string }) {
  return (
    <div style={{ textAlign: "center" }} className="text-admin-indigo-deep">
      <div style={{ fontFamily: "ui-monospace, monospace", fontSize: 13, fontWeight: 600 }}>{rate.toFixed(2)}%</div>
      <div style={{ fontSize: 10, opacity: 0.7 }} className="text-admin-indigo-deep">{caption}</div>
    </div>
  );
}
