"use client";

import { useState } from "react";
import { TALENT_RATE_FOR_CONV } from "../../messages";
import { COLORS, EARNINGS_ROWS, FONTS, RADIUS, TRANSITION } from "../../state";
import { useTalentConversations } from "./conversation-adapter-1";
import { EarningRow } from "./today-1";
import type { TalentEarnings, TalentEarningsRow } from "@/lib/talent/earnings-types";
import type { EarningsRow } from "../../state";

const CURRENCY_SYMBOL: Record<string, string> = { EUR: "€", USD: "$", GBP: "£", MXN: "MX$" };

/** Adapt a real bridge earnings row to the EarningRow fixture shape so the
 *  existing row component (with its source/payment chips) renders real data. */
function realRowToEarning(r: TalentEarningsRow, currencySymbol: string): EarningsRow {
  const source: EarningsRow["source"] =
    r.source === "agency_routed"
      ? { kind: "agency" }
      : r.source === "personal_page"
        ? { kind: "personal" }
        : r.source === "hub"
          ? { kind: "hub", name: r.agencyName }
          : { kind: "manual" };
  return {
    id: r.id,
    workDate: r.workDate,
    payoutDate: r.payoutDate ?? "",
    agency: r.agencyName,
    client: r.client,
    amount: `${currencySymbol}${Math.round(r.netCents / 100).toLocaleString()}`,
    status: r.status === "confirmed" ? "pending" : r.status,
    source,
    paymentMethod: (r.paymentMethod as EarningsRow["paymentMethod"]) ?? "transfer",
  };
}




// ════════════════════════════════════════════════════════════════════
// WS-8.3 Earnings tile with cycle selector + sparkline
// ════════════════════════════════════════════════════════════════════

const EARNINGS_SPARKLINE = [820, 1100, 950, 1400, 1200, 1600, 1350, 1800, 1450, 2100, 1900, 2400];

const EARNINGS_CYCLE_DATA: Record<string, { total: number; count: number; label: string }> = {
  month: { total: 2400,  count: 3,  label: "This month" },
  quarter: { total: 7800, count: 9,  label: "This quarter" },
  year:  { total: 24600, count: 32, label: "This year" },
};


export function EarningsTile({
  currency,
  monthTotal,
  earnings = null,
  onSeeAll,
  onLogWork,
}: {
  currency: string;
  monthTotal: number;
  /** Real talent earnings from the bridge. When provided, the tile shows REAL
   *  data (no fabricated sparkline / cycle / demo rows); null = demo mode. */
  earnings?: TalentEarnings | null;
  onSeeAll: () => void;
  onLogWork: () => void;
}) {
  const realMode = earnings != null;
  const [cycle, setCycle] = useState<"month" | "quarter" | "year">("month");
  const conversations = useTalentConversations();

  // Real-mode totals derived from the actual earnings rows; demo-mode falls
  // back to the prototype cycle fixture so standalone previews still look full.
  const realCurrency = realMode
    ? CURRENCY_SYMBOL[earnings.totals.currency.toUpperCase()] ?? earnings.totals.currency.toUpperCase()
    : currency;
  const realYtdTotal = realMode ? Math.round(earnings.totals.ytdNetCents / 100) : 0;
  const realPaidRows = realMode ? earnings.rows.filter((r) => r.status === "paid") : [];

  const data = realMode
    ? {
        month: { total: Math.round(monthTotal), count: 0, label: "This month" },
        quarter: { total: realYtdTotal, count: realPaidRows.length, label: "This year" },
        year: { total: realYtdTotal, count: realPaidRows.length, label: "This year" },
      }[cycle]
    : EARNINGS_CYCLE_DATA[cycle];
  const sparkMax = Math.max(...EARNINGS_SPARKLINE);
  const width = 180, height = 44;

  // Pending = booked-but-not-yet-wrapped conversations × their take-
  // home rate. Surfaces "money in flight" so the headline doesn't
  // pretend the month is over when the talent has 3 paydays coming.
  // Same source as the messages shell — single truth.
  const pendingConvs = conversations.filter((c) => c.stage === "booked");
  const pendingTotal = pendingConvs.reduce((sum, c) => {
    const raw = TALENT_RATE_FOR_CONV[c.id];
    if (!raw || raw === "—") return sum;
    const num = parseFloat(raw.replace(/[^0-9.]/g, ""));
    return sum + (isNaN(num) ? 0 : num);
  }, 0);
  const pendingCurrency = (() => {
    for (const c of pendingConvs) {
      const m = TALENT_RATE_FOR_CONV[c.id]?.match(/[€£$]/);
      if (m) return m[0];
    }
    return currency;
  })();
  // Trend signal — demo only. In real mode we don't fabricate a 6-month
  // trend from a hard-coded sparkline, so the bullet is hidden.
  const sparkAvg = EARNINGS_SPARKLINE.reduce((s, v) => s + v, 0) / EARNINGS_SPARKLINE.length;
  const trendUp = monthTotal >= sparkAvg;
  const showTrend = !realMode;
  const tileCurrency = realMode ? realCurrency : currency;

  const points = EARNINGS_SPARKLINE.map((v, i) => {
    const x = (i / (EARNINGS_SPARKLINE.length - 1)) * width;
    const y = height - (v / sparkMax) * (height - 4) - 2;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");

  return (
    <section style={{ background: "#fff", border:     `1px solid ${COLORS.borderSoft}`, padding:    "16px 18px" }} className="rounded-admin-lg">
      {/* Header row */}
      <div style={{ display: "flex", alignItems: "flex-start", gap: 12, marginBottom: 12 }}>
        <div className="flex-1">
          <div style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", fontFamily: FONTS.body, marginBottom: 4 }} className="text-admin-ink-dim">
            Earnings
            {/* Trend bullet — green = above 6-mo avg, amber = below. Demo only:
                hidden in real mode (we don't fabricate a trend). */}
            {showTrend && <span aria-label={trendUp ? "Trending up vs 6-month average" : "Trending down vs 6-month average"} style={{
              display: "inline-flex", alignItems: "center", gap: 3,
              padding: "1px 6px", borderRadius: 999,
              background: trendUp ? COLORS.successSoft : `${COLORS.amber}18`,
              color: trendUp ? (COLORS.successDeep ?? COLORS.success) : COLORS.amber,
              fontSize: 9, fontWeight: 700, letterSpacing: 0.3,
            }}>
              <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
                {trendUp
                  ? <path d="M1 6l3-3 3 3M4 3v4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
                  : <path d="M1 2l3 3 3-3M4 5V1" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>}
              </svg>
              {trendUp ? "Up" : "Down"}
            </span>}
          </div>
          <div style={{ fontSize: 26, fontWeight: 700, fontFamily: FONTS.body, letterSpacing: "-0.5px" }} className="text-admin-ink">
            {tileCurrency}{(data.total).toLocaleString()}
          </div>
          <div style={{ fontSize: 11, fontFamily: FONTS.body, marginTop: 2 }} className="text-admin-ink-muted">
            {data.count} payout{data.count !== 1 ? "s" : ""} · {data.label}
          </div>
        </div>

        {/* Cycle selector */}
        <div style={{ display: "flex", padding: 2, gap: 1 }} className="bg-admin-surface-alt rounded-admin-md">
          {(["month", "quarter", "year"] as const).map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setCycle(c)}
              style={{
                fontSize:    10,
                fontWeight:  cycle === c ? 700 : 500,
                padding:     "3px 8px",
                border:      "none",
                borderRadius: RADIUS.sm,
                cursor:      "pointer",
                background:  cycle === c ? COLORS.fill : "transparent",
                color:       cycle === c ? "#fff" : COLORS.inkMuted,
                fontFamily:  FONTS.body,
                transition:  `background ${TRANSITION.micro}, color ${TRANSITION.micro}`,
              }}
            >
              {c === "month" ? "Mo" : c === "quarter" ? "Qtr" : "Yr"}
            </button>
          ))}
        </div>
      </div>

      {/* Sparkline — demo only (hard-coded series; not fabricated in real mode) */}
      {!realMode && <svg width={width} height={height} style={{ display: "block", marginBottom: 12, overflow: "visible" }}>
        <defs>
          <linearGradient id="earnings-grad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={COLORS.accent} stopOpacity={0.18} />
            <stop offset="100%" stopColor={COLORS.accent} stopOpacity={0} />
          </linearGradient>
        </defs>
        {/* Area fill */}
        <polygon
          points={`0,${height} ${points} ${width},${height}`}
          fill="url(#earnings-grad)"
        />
        {/* Line */}
        <polyline
          points={points}
          fill="none"
          stroke={COLORS.accent}
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {/* Last dot */}
        <circle
          cx={width}
          cy={parseFloat(points.split(" ").at(-1)!.split(",")[1]!)}
          r={3}
          fill={COLORS.accent}
        />
      </svg>}

      {/* Pending payouts strip — money already booked, not yet paid.
          Sourced from MOCK_CONVERSATIONS (booked stage) so it always
          mirrors the messages shell. Empty state hidden. */}
      {!realMode && pendingTotal > 0 && (
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", marginBottom: 10, background: `linear-gradient(135deg, ${COLORS.accentSoft} 0%, ${COLORS.surfaceAlt} 100%)`, border: `1px solid rgba(15,79,62,0.16)` }} className="rounded-admin-md">
          <span aria-hidden style={{
            display: "inline-flex", alignItems: "center", justifyContent: "center",
            width: 26, height: 26, borderRadius: 8,
            background: "#fff", color: COLORS.accentDeep,
            border: `1px solid rgba(15,79,62,0.18)`,
            flexShrink: 0,
          }}>
            <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
              <circle cx="7" cy="7" r="5.5" stroke="currentColor" strokeWidth="1.4"/>
              <path d="M7 4v3l2 1" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </span>
          <div className="flex-1 min-w-0">
            <div style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: 0.4, textTransform: "uppercase", fontFamily: FONTS.body }} className="text-admin-accent-deep">
              In flight
            </div>
            <div style={{ fontSize: 13, fontWeight: 700, fontFamily: FONTS.body, marginTop: 1, fontVariantNumeric: "tabular-nums" }} className="text-admin-ink">
              {pendingCurrency}{Math.round(pendingTotal).toLocaleString()}
              <span style={{ fontWeight: 500, marginLeft: 6 }} className="text-admin-ink-muted">
                · {pendingConvs.length} booked job{pendingConvs.length === 1 ? "" : "s"}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Recent rows — real paid rows in real mode (empty state when none),
          fixture rows in demo mode. */}
      <div className="mb-2.5">
        {realMode ? (
          realPaidRows.length > 0 ? (
            realPaidRows.slice(0, 3).map((r) => (
              <EarningRow key={r.id} earning={realRowToEarning(r, realCurrency)} />
            ))
          ) : (
            <p className="text-admin-ink-muted text-admin-12 py-2.5 px-0.5">
              No paid bookings yet — your earnings will appear here once a client pays.
            </p>
          )
        ) : (
          EARNINGS_ROWS.slice(0, 3).map((e) => <EarningRow key={e.id} earning={e} />)
        )}
      </div>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={onSeeAll}
          style={{
            flex: 1, padding: "6px 0", background: COLORS.surfaceAlt,
            border: `1px solid ${COLORS.borderSoft}`, borderRadius: RADIUS.md,
            fontSize: 12, fontWeight: 600, cursor: "pointer",
            color: COLORS.ink, fontFamily: FONTS.body,
          }}
        >
          See all earnings →
        </button>
        <button
          type="button"
          onClick={onLogWork}
          style={{
            padding: "6px 12px", background: "transparent",
            border: `1px solid ${COLORS.borderSoft}`, borderRadius: RADIUS.md,
            fontSize: 12, fontWeight: 600, cursor: "pointer",
            color: COLORS.inkMuted, fontFamily: FONTS.body,
          }}
        >
          + Log work
        </button>
      </div>
    </section>
  );
}
