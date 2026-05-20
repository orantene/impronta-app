"use client";

import { useState } from "react";
import { COLORS, FONTS, TRANSITION, fmtMoney } from "../state";
import type { WebsiteAnalytics, WebsitePageRow, WebsitePeriodMetrics } from "../state";
import { PageStatusChip } from "./SitePage";


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

// Visual page card — replaces flat table rows with browser-chrome mockup cards.
// Each card shows the page title prominently, a faux URL bar, status chip, and
// an inline bar showing relative hits-7d compared to top page in the set.
export function PageVisualCard({ page, maxHits, onClick }: { page: WebsitePageRow; maxHits: number; onClick?: () => void }) {
  const hits = page.hits7d ?? 0;
  const fillPct = maxHits > 0 ? (hits / maxHits) * 100 : 0;
  const isLive = page.status === "published";
  const label = `Open visual editor for ${page.title} (${page.slug})`;
  return (
    <button type="button" onClick={onClick} aria-label={label}
      style={{
        textAlign: "left", cursor: "pointer", border: `1px solid ${COLORS.borderSoft}`, borderRadius: 12,
        background: "#fff", padding: 0, fontFamily: FONTS.body, overflow: "hidden",
        display: "flex", flexDirection: "column", transition: `transform ${TRANSITION.micro}, box-shadow ${TRANSITION.micro}, border-color ${TRANSITION.micro}`,
      }}
      onMouseEnter={(e) => { e.currentTarget.style.borderColor = COLORS.indigoDeep; e.currentTarget.style.boxShadow = "0 4px 14px rgba(11,11,13,0.06)"; e.currentTarget.style.transform = "translateY(-1px)"; }}
      onMouseLeave={(e) => { e.currentTarget.style.borderColor = COLORS.borderSoft; e.currentTarget.style.boxShadow = "none"; e.currentTarget.style.transform = "translateY(0)"; }}
    >
      {/* Faux browser chrome / preview band */}
      <div style={{ height: 70, background: `linear-gradient(135deg, ${COLORS.surfaceAlt} 0%, #fff 100%)`, borderBottom: `1px solid ${COLORS.borderSoft}`, padding: "10px 12px", display: "flex", flexDirection: "column", gap: 8 }}>
        <div className="flex gap-1">
          <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#FF5F57" }} />
          <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#FEBC2E" }} />
          <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#28C840" }} />
        </div>
        <div style={{ background: "#fff", border: `1px solid ${COLORS.borderSoft}`, borderRadius: 6, padding: "4px 8px", fontFamily: "ui-monospace, monospace", fontSize: 10.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} className="text-admin-ink-muted">{page.slug}</div>
      </div>
      {/* Body */}
      <div style={{ padding: 14, display: "flex", flexDirection: "column", gap: 10, flex: 1 }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
          <div style={{ fontSize: 14, fontWeight: 600, letterSpacing: -0.1, lineHeight: 1.25, flex: 1, minWidth: 0 }} className="text-admin-ink">{page.title}</div>
          <PageStatusChip status={page.status} />
        </div>
        {/* Inline bar — hits relative to top page */}
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 4 }}>
            <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: 0.5, textTransform: "uppercase" }} className="text-admin-ink-muted">Hits 7d</span>
            <span style={{ fontFamily: "ui-monospace, monospace", fontSize: 12, fontWeight: 600, fontVariantNumeric: "tabular-nums" }} className="text-admin-ink">{hits.toLocaleString()}</span>
          </div>
          <div style={{ height: 4, borderRadius: 999, overflow: "hidden" }} className="bg-admin-surface-alt">
            <div style={{ width: `${fillPct}%`, height: "100%", background: isLive ? COLORS.indigoDeep : COLORS.inkDim, borderRadius: 999, transition: "width 200ms ease" }} />
          </div>
        </div>
        <div aria-hidden style={{ fontSize: 10, fontWeight: 600, letterSpacing: 0.02 }} className="text-admin-indigo-deep">
          Visual editor →
        </div>
        <div style={{ marginTop: "auto", display: "flex", justifyContent: "space-between", fontSize: 11 }} className="text-admin-ink-muted">
          <span>by {page.lastEditedBy}</span>
          <span>{page.updatedAt}</span>
        </div>
      </div>
    </button>
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
function Tile({ label, value, current, prior, accent, fmtPrior }: { label: string; value: string; current: number; prior: number; accent?: boolean; fmtPrior?: (n: number) => string }) {
  const delta = prior > 0 ? ((current - prior) / prior) * 100 : 0;
  const dir = Math.abs(delta) < 0.5 ? "flat" : (delta > 0 ? "up" : "down");
  const color = dir === "up" ? COLORS.successDeep : dir === "down" ? COLORS.criticalDeep : COLORS.inkMuted;
  const priorLabel = fmtPrior && typeof prior === "number" && prior > 1000 && label === "Booking revenue"
    ? fmtPrior(prior)
    : prior.toLocaleString();
  return (
    <div style={{ padding: 14, borderRadius: 10, background: accent ? COLORS.accentSoft : "#fff", border: `1px solid ${accent ? "rgba(15,79,62,0.24)" : COLORS.borderSoft}` }}>
      <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: 0.6, textTransform: "uppercase" }} className="text-admin-ink-muted">{label}</div>
      <div style={{ fontFamily: FONTS.display, fontSize: 24, fontWeight: 600, color: accent ? COLORS.accentDeep : COLORS.ink, marginTop: 4, fontVariantNumeric: "tabular-nums", letterSpacing: -0.3 }}>{value}</div>
      <div style={{ fontSize: 11, color, marginTop: 2 }}>
        {dir === "up" ? "↑" : dir === "down" ? "↓" : "→"} {Math.abs(delta).toFixed(1)}%
        <span style={{ marginLeft: 4 }} className="text-admin-ink-dim">vs {priorLabel}</span>
      </div>
    </div>
  );
}

export function WebsitePerformance({ analytics, pages, fmtMoney }: { analytics: WebsiteAnalytics; pages: WebsitePageRow[]; fmtMoney: (n: number) => string }) {
  const [period, setPeriod] = useState<"7d" | "30d">("7d");
  const [topView, setTopView] = useState<"pages" | "talent">("pages");
  const m: WebsitePeriodMetrics = period === "7d" ? analytics.last7d : analytics.last30d;
  const byPage = period === "7d" ? analytics.byPage7d : analytics.byPage30d;
  const byTalent = period === "7d" ? analytics.byTalent7d : analytics.byTalent30d;
  const overallConv = m.visits > 0 ? (m.bookings / m.visits) * 100 : 0;
  const v2i = m.visits > 0 ? (m.inquiries / m.visits) * 100 : 0;
  const i2b = m.inquiries > 0 ? (m.bookings / m.inquiries) * 100 : 0;

  const topPages = byPage
    .filter(p => p.visits > 0)
    .sort((a, b) => b.visits - a.visits)
    .slice(0, 4)
    .map(p => ({ ...p, title: pages.find(pg => pg.id === p.pageId)?.title ?? "—" }));

  const topTalent = byTalent
    .filter(t => t.visits > 0)
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 4)
    .map(t => ({ ...t, topPageTitle: pages.find(pg => pg.id === t.topPageId)?.title ?? "—" }));

  return (
    <section style={{ marginBottom: 18 }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 8, flexWrap: "wrap" }}>
        <h2 style={{ margin: 0, fontFamily: FONTS.display, fontSize: 18, fontWeight: 600, letterSpacing: -0.2 }} className="text-admin-ink">Performance</h2>
        <span style={{ fontSize: 11.5, fontFamily: FONTS.body }} className="text-admin-ink-muted">vs prior {period}</span>
        <div style={{ marginLeft: "auto", display: "inline-flex", border: `1px solid ${COLORS.borderSoft}`, borderRadius: 999, padding: 3, fontFamily: FONTS.body }} className="bg-admin-surface-alt">
          {(["7d", "30d"] as const).map(p => {
            const active = p === period;
            return (
              <button key={p} type="button" onClick={() => setPeriod(p)} style={{ padding: "5px 12px", fontSize: 11.5, fontWeight: 600, letterSpacing: 0.2, borderRadius: 999, border: "none", cursor: "pointer", background: active ? "#fff" : "transparent", color: active ? COLORS.ink : COLORS.inkMuted, boxShadow: active ? "0 1px 3px rgba(0,0,0,0.06)" : "none", transition: "all 120ms ease" }}>{p === "7d" ? "7 days" : "30 days"}</button>
            );
          })}
        </div>
      </div>

      <div style={{ background: "#fff", border: `1px solid ${COLORS.borderSoft}`, borderRadius: 14, padding: 18, display: "flex", flexDirection: "column", gap: 18 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 14 }}>
          <Tile label="Visits"           value={m.visits.toLocaleString()}   current={m.visits}    prior={m.prior.visits} />
          <Tile label="Inquiries"        value={m.inquiries.toLocaleString()} current={m.inquiries} prior={m.prior.inquiries} />
          <Tile label="Bookings"         value={m.bookings.toLocaleString()} current={m.bookings}  prior={m.prior.bookings} />
          <Tile label="Booking revenue"  value={fmtMoney(m.revenue)}          current={m.revenue}   prior={m.prior.revenue}  accent fmtPrior={fmtMoney} />
        </div>

        {/* Funnel strip */}
        <div style={{ border: "1px solid rgba(91,107,160,0.18)", borderRadius: 10, padding: "14px 16px", display: "grid", gridTemplateColumns: "1fr auto 1fr auto 1fr", alignItems: "center", gap: 12 }} className="bg-admin-indigo-soft">
          <FunnelStep label="Visits"     value={m.visits.toLocaleString()} />
          <FunnelArrow rate={v2i} caption="visit → inquiry" />
          <FunnelStep label="Inquiries"  value={m.inquiries.toLocaleString()} />
          <FunnelArrow rate={i2b} caption="inquiry → booking" />
          <FunnelStep label="Bookings"   value={m.bookings.toLocaleString()} />
          <div style={{ gridColumn: "1 / -1", paddingTop: 10, marginTop: 4, borderTop: "1px solid rgba(91,107,160,0.18)", display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 11.5, fontFamily: FONTS.body }} className="text-admin-indigo-deep">
            <span style={{ fontWeight: 600, textTransform: "uppercase", fontSize: 10.5, letterSpacing: 0.6 }}>Overall conversion</span>
            <span style={{ fontFamily: "ui-monospace, monospace", fontWeight: 600, fontSize: 13 }}>{overallConv.toFixed(2)}%
              <span style={{ marginLeft: 6, opacity: 0.6, fontSize: 11 }}>({m.bookings} of {m.visits.toLocaleString()})</span>
            </span>
          </div>
        </div>

        {/* Top performers — Pages | Talent switcher */}
        <div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10, flexWrap: "wrap", gap: 8 }}>
            <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: 0.6, textTransform: "uppercase", fontFamily: FONTS.body }} className="text-admin-ink-muted">Top performers</div>
            <div style={{ display: "inline-flex", border: `1px solid ${COLORS.borderSoft}`, borderRadius: 999, padding: 3, fontFamily: FONTS.body }} className="bg-admin-surface-alt">
              {(["pages", "talent"] as const).map(v => {
                const active = topView === v;
                return (
                  <button key={v} type="button" onClick={() => setTopView(v)} style={{ padding: "5px 14px", fontSize: 11.5, fontWeight: 600, letterSpacing: 0.2, borderRadius: 999, border: "none", cursor: "pointer", background: active ? "#fff" : "transparent", color: active ? COLORS.ink : COLORS.inkMuted, boxShadow: active ? "0 1px 3px rgba(0,0,0,0.06)" : "none", transition: "all 120ms ease" }}>{v === "pages" ? "Pages" : "Talent"}</button>
                );
              })}
            </div>
          </div>

          {topView === "pages" && topPages.length > 0 && (
            <div style={{ border: `1px solid ${COLORS.borderSoft}`, borderRadius: 10, overflow: "hidden" }}>
              <div style={{ display: "grid", gridTemplateColumns: "1.5fr 1fr 1fr 1fr 1fr", padding: "8px 14px", borderBottom: `1px solid ${COLORS.borderSoft}`, fontSize: 10.5, fontWeight: 600, letterSpacing: 0.5, textTransform: "uppercase", fontFamily: FONTS.body }} className="bg-admin-surface-alt text-admin-ink-muted">
                <div>Page</div>
                <div className="text-right">Visits</div>
                <div className="text-right">Inquiries</div>
                <div className="text-right">Bookings</div>
                <div className="text-right">Conv. rate</div>
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
                <div>Talent</div>
                <div className="text-right">Visits</div>
                <div className="text-right">Inquiries</div>
                <div className="text-right">Bookings</div>
                <div className="text-right">Revenue</div>
                <div className="text-right">Top page</div>
              </div>
              {topTalent.map((t, i) => {
                const conv = t.visits > 0 ? (t.bookings / t.visits) * 100 : 0;
                const tone = (overallConv > 0 && conv >= overallConv) ? COLORS.successDeep : t.revenue > 0 ? COLORS.indigoDeep : COLORS.inkDim;
                return (
                  <div key={t.talentId} style={{ display: "grid", gridTemplateColumns: "1.5fr 1fr 1fr 1fr 1fr 1.2fr", padding: "10px 14px", alignItems: "center", borderTop: i === 0 ? "none" : `1px solid ${COLORS.borderSoft}`, fontSize: 13, color: COLORS.ink, fontFamily: FONTS.body }}>
                    <span className="flex flex-col gap-0.5">
                      <span className="font-semibold">{t.talentName}</span>
                      <span style={{ fontSize: 11 }} className="text-admin-ink-dim">{conv > 0 ? `${conv.toFixed(2)}% conv` : "no bookings"}</span>
                    </span>
                    <span style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{t.visits.toLocaleString()}</span>
                    <span style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{t.inquiries}</span>
                    <span style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{t.bookings}</span>
                    <span style={{ textAlign: "right", fontVariantNumeric: "tabular-nums", fontWeight: 600, color: tone }}>{fmtMoney(t.revenue)}</span>
                    <span style={{ textAlign: "right", fontSize: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} className="text-admin-ink-muted">{t.topPageTitle}</span>
                  </div>
                );
              })}
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
