"use client";

import { useState } from "react";
import { CapsLabel, CelebrationBanner, EmptyState, Icon, SecondaryButton } from "../../primitives";
import { COLORS, EARNINGS_ROWS, FONTS, useAdminShell } from "../../state";
import { ReachStat, ReachStatDivider } from "../shared/calendar-2";
import { PageHeader } from "../shared/page-chrome-1";
import { EarningRow } from "../shared/today-1";



// ════════════════════════════════════════════════════════════════════
// ACTIVITY (earnings + history)
// ════════════════════════════════════════════════════════════════════

// ─── B3: Activity — earnings & history (compactness pass) ──────────
//
// Replaces the table layout with the unified EarningRow pattern. Adds
// filter chips per source so the talent can slice "what did the personal
// page earn me" vs "what came from agencies" — the Reach connection
// surfaced inline.

/**
 * Earnings forecast tile (E3). Two numbers — projected year-end total
 * and the next-30-day forecast — surfaced as a compact strip so the
 * talent has a forward-looking view of their pipeline, not just a YTD
 * rear-view. Math here is intentionally naive (linear pace × pace
 * adjustment); production would consult a confidence-weighted model.
 *
 * The "Pipeline confidence" caption hints at the model's quality so the
 * talent doesn't over-trust an early-year extrapolation.
 */
/**
 * Audit #37 — Earnings goal progress ring. SVG-based circular
 * progress with the YTD total in the middle and remaining/percent
 * captions. Goal is configurable inline (click "Edit goal").
 *
 * Math: goal defaults to €30k/yr; progress = total / goal capped at
 * 100%. Stroke is forest accent for "on or above pace", amber if
 * pace is < 70% of where it should be by date, coral if < 40%.
 */
function EarningsGoalRing({ total }: { total: number }) {
  const { toast } = useAdminShell();
  const [goal, setGoal] = useState(30000);
  const [editOpen, setEditOpen] = useState(false);
  const [editValue, setEditValue] = useState(String(goal));

  const monthsElapsed = 4;          // mock — Apr
  const expectedByNow = (goal / 12) * monthsElapsed;
  const paceRatio = expectedByNow > 0 ? total / expectedByNow : 0;
  const tone = paceRatio >= 1 ? COLORS.green : paceRatio >= 0.7 ? COLORS.amber : COLORS.coral;
  const paceLabel = paceRatio >= 1 ? "On track" : paceRatio >= 0.7 ? "Slightly behind" : "Behind pace";
  const pct = Math.min(1, total / goal);
  const radius = 36;
  const circumference = 2 * Math.PI * radius;
  const dash = circumference * pct;

  return (
    <section
      style={{
        display: "flex",
        alignItems: "center",
        gap: 16,
        padding: "16px 18px",
        background: "#fff",
        border: `1px solid ${COLORS.borderSoft}`,
        borderRadius: 12,
        marginBottom: 16,
        fontFamily: FONTS.body,
      }}
    >
      {/* SVG ring */}
      <div style={{ position: "relative", width: 88, height: 88, flexShrink: 0 }}>
        <svg width={88} height={88} viewBox="0 0 88 88" aria-hidden>
          <circle cx={44} cy={44} r={radius} fill="none" stroke="rgba(11,11,13,0.08)" strokeWidth={6} />
          <circle
            cx={44}
            cy={44}
            r={radius}
            fill="none"
            stroke={tone}
            strokeWidth={6}
            strokeLinecap="round"
            strokeDasharray={`${dash} ${circumference}`}
            transform="rotate(-90 44 44)"
            style={{ transition: "stroke-dasharray .6s cubic-bezier(.4,.0,.2,1)" }}
          />
        </svg>
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <span
            style={{
              fontFamily: FONTS.display,
              fontSize: 18,
              fontWeight: 600,
              color: COLORS.ink,
              letterSpacing: -0.3,
            }}
          >
            {Math.round(pct * 100)}%
          </span>
          <span
            style={{
              fontSize: 9.5,
              color: COLORS.inkMuted,
              fontWeight: 600,
                          }}
          >
            of goal
          </span>
        </div>
      </div>

      {/* Right side — amount, goal, pace, edit */}
      <div className="flex-1 min-w-0">
        <div
          style={{
            fontSize: 10.5,
            fontWeight: 700,
            letterSpacing: 0.7,
            textTransform: "uppercase",
            color: COLORS.inkMuted,
            marginBottom: 2,
          }}
        >
          2026 earnings goal
        </div>
        <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
          <span style={{ fontFamily: FONTS.display, fontSize: 22, fontWeight: 500, color: COLORS.ink, letterSpacing: -0.3 }}>
            €{total.toLocaleString()}
          </span>
          <span style={{ fontSize: 12, color: COLORS.inkMuted }}>
            of €{goal.toLocaleString()}
          </span>
          <span
            style={{
              fontSize: 11,
              fontWeight: 600,
              padding: "2px 7px",
              borderRadius: 999,
              background: tone === COLORS.green ? COLORS.successSoft : tone === COLORS.amber ? "rgba(176,141,82,0.12)" : COLORS.coralSoft,
              color: tone === COLORS.green ? COLORS.successDeep : tone === COLORS.amber ? COLORS.amber : COLORS.coralDeep,
              marginLeft: "auto",
            }}
          >
            {paceLabel}
          </span>
        </div>
        <div style={{ fontSize: 11.5, color: COLORS.inkMuted, marginTop: 4 }}>
          €{Math.max(0, goal - total).toLocaleString()} to go · expected by now ≈ €{Math.round(expectedByNow).toLocaleString()}
        </div>
        {editOpen ? (
          <div style={{ marginTop: 8, display: "flex", gap: 6, alignItems: "center" }}>
            <span style={{ fontSize: 12, color: COLORS.inkMuted }}>€</span>
            <input
              type="text"
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              autoFocus
              style={{
                width: 100,
                padding: "5px 8px",
                fontFamily: FONTS.body,
                fontSize: 12.5,
                color: COLORS.ink,
                background: "#fff",
                border: `1px solid ${COLORS.borderSoft}`,
                borderRadius: 6,
                outline: "none",
              }}
            />
            <button
              type="button"
              onClick={() => {
                const next = parseInt(editValue.replace(/[^0-9]/g, ""), 10);
                if (next > 0) {
                  setGoal(next);
                }
                setEditOpen(false);
              }}
              style={{
                padding: "5px 10px",
                background: COLORS.fill,
                color: "#fff",
                border: "none",
                borderRadius: 6,
                cursor: "pointer",
                fontFamily: FONTS.body,
                fontSize: 11.5,
                fontWeight: 600,
              }}
            >
              Save
            </button>
            <button
              type="button"
              onClick={() => setEditOpen(false)}
              style={{
                padding: "5px 8px",
                background: "transparent",
                color: COLORS.inkMuted,
                border: "none",
                cursor: "pointer",
                fontFamily: FONTS.body,
                fontSize: 11.5,
              }}
            >
              Cancel
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => { setEditValue(String(goal)); setEditOpen(true); }}
            style={{
              marginTop: 6,
              background: "transparent",
              border: "none",
              padding: 0,
              fontFamily: FONTS.body,
              fontSize: 11.5,
              fontWeight: 600,
              color: COLORS.indigo,
              cursor: "pointer",
            }}
          >
            Edit goal →
          </button>
        )}
      </div>
    </section>
  );
}


function ForecastTile({ total, bookingsCount }: { total: number; bookingsCount: number }) {
  // Assume we're 4 months into the year for the prototype's mock data
  // (April). Production reads this from the actual current month + the
  // talent's full earnings ledger.
  const monthsElapsed = 4;
  const avgPerMonth = total / monthsElapsed;
  const yearEndProjection = Math.round(avgPerMonth * 12);
  const next30 = Math.round(avgPerMonth * 1.05); // 5% pace bump from active pipeline
  const confidence = bookingsCount >= 8 ? "High" : bookingsCount >= 4 ? "Medium" : "Low";
  const confidenceColor = confidence === "High" ? COLORS.green : confidence === "Medium" ? COLORS.amber : COLORS.coral;

  return (
    <section
      data-tulala-forecast-tile
      style={{
        display: "flex",
        alignItems: "stretch",
        gap: 0,
        background: "#fff",
        border: `1px solid ${COLORS.borderSoft}`,
        borderRadius: 12,
        marginBottom: 16,
        overflow: "hidden",
      }}
    >
      <div style={{ flex: 1, padding: "14px 18px" }}>
        <div
          style={{
            fontFamily: FONTS.body,
            fontSize: 10.5,
            fontWeight: 600,
            letterSpacing: 0.7,
            textTransform: "uppercase",
            color: COLORS.inkMuted,
          }}
        >
          Forecast · year-end
        </div>
        <div
          style={{
            fontFamily: FONTS.display,
            fontSize: 26,
            fontWeight: 500,
            color: COLORS.ink,
            letterSpacing: -0.4,
            marginTop: 2,
            lineHeight: 1.1,
          }}
        >
          €{yearEndProjection.toLocaleString()}
        </div>
        <div style={{ fontFamily: FONTS.body, fontSize: 11.5, color: COLORS.inkMuted, marginTop: 4 }}>
          Based on YTD pace × 12. {bookingsCount < 4 ? "Few data points yet — wide error band." : "Updates monthly."}
        </div>
      </div>
      <div style={{ width: 1, background: COLORS.borderSoft }} />
      <div style={{ flex: 1, padding: "14px 18px" }}>
        <div
          style={{
            fontFamily: FONTS.body,
            fontSize: 10.5,
            fontWeight: 600,
            letterSpacing: 0.7,
            textTransform: "uppercase",
            color: COLORS.inkMuted,
          }}
        >
          Next 30 days
        </div>
        <div
          style={{
            fontFamily: FONTS.display,
            fontSize: 26,
            fontWeight: 500,
            color: COLORS.ink,
            letterSpacing: -0.4,
            marginTop: 2,
            lineHeight: 1.1,
          }}
        >
          €{next30.toLocaleString()}
        </div>
        <div style={{ fontFamily: FONTS.body, fontSize: 11.5, color: COLORS.inkMuted, marginTop: 4 }}>
          Live pipeline + recent close-rate. Updated daily.
        </div>
      </div>
      <div style={{ width: 1, background: COLORS.borderSoft }} />
      <div style={{ padding: "14px 18px", display: "flex", flexDirection: "column", justifyContent: "center" }}>
        <div
          style={{
            fontFamily: FONTS.body,
            fontSize: 10.5,
            fontWeight: 600,
            letterSpacing: 0.7,
            textTransform: "uppercase",
            color: COLORS.inkMuted,
          }}
        >
          Confidence
        </div>
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            marginTop: 6,
            fontFamily: FONTS.body,
            fontSize: 13,
            fontWeight: 600,
            color: confidenceColor,
          }}
        >
          <span aria-hidden style={{ width: 7, height: 7, borderRadius: "50%", background: confidenceColor }} />
          {confidence}
        </div>
      </div>
    </section>
  );
}


function ActivityPage() {
  const { openDrawer, toast } = useAdminShell();
  const [filter, setFilter] = useState<"all" | "agency" | "personal" | "hub" | "studio" | "manual">("all");
  // Celebration moment is local-only in the prototype; production wires
  // this to talent_celebration_events with a dismissed_at flag so the
  // banner doesn't reappear on next session.
  const [celebrationDismissed, setCelebrationDismissed] = useState(false);

  const filtered = EARNINGS_ROWS.filter(
    (e) => filter === "all" || e.source.kind === filter,
  );

  const total = EARNINGS_ROWS.reduce((sum, e) => {
    const num = parseFloat(e.amount.replace(/[^0-9.]/g, "")) || 0;
    return sum + num;
  }, 0);

  const filteredTotal = filtered.reduce((sum, e) => {
    const num = parseFloat(e.amount.replace(/[^0-9.]/g, "")) || 0;
    return sum + num;
  }, 0);

  // Top-source — what's actually earning the most.
  const sourceTotals: Record<string, number> = {};
  for (const e of EARNINGS_ROWS) {
    const k = e.source.kind;
    const num = parseFloat(e.amount.replace(/[^0-9.]/g, "")) || 0;
    sourceTotals[k] = (sourceTotals[k] ?? 0) + num;
  }
  const topSource = Object.entries(sourceTotals).sort((a, b) => b[1] - a[1])[0];
  const topSourceLabel = topSource
    ? topSource[0] === "agency"
      ? "Agency-routed"
      : topSource[0] === "personal"
        ? "Personal page"
        : topSource[0] === "hub"
          ? "Tulala Hub"
          : topSource[0] === "manual"
            ? "Off-platform"
            : topSource[0]
    : "—";

  const counts = {
    all: EARNINGS_ROWS.length,
    agency: EARNINGS_ROWS.filter((e) => e.source.kind === "agency").length,
    personal: EARNINGS_ROWS.filter((e) => e.source.kind === "personal").length,
    hub: EARNINGS_ROWS.filter((e) => e.source.kind === "hub").length,
    studio: EARNINGS_ROWS.filter((e) => e.source.kind === "studio").length,
    manual: EARNINGS_ROWS.filter((e) => e.source.kind === "manual").length,
  };

  return (
    <>
      <PageHeader
        title="Activity"
        subtitle="Earnings & history."
        actions={
          <>
            <SecondaryButton onClick={() => openDrawer("talent-add-event", { mode: "work" })}>
              + Log work
            </SecondaryButton>
            <SecondaryButton onClick={() => openDrawer("talent-payouts")}>
              Payout settings
            </SecondaryButton>
          </>
        }
      />

      {/* Audit #38 — multiple celebration thresholds, not just €1k.
          Picks the highest threshold the user crossed, in priority order:
          €10k YTD > €5k YTD > 10 bookings > €1k YTD > 5 bookings.
          Audit #39 — primary CTA now opens the booking detail that
          tipped past the milestone, instead of clicking back to "All". */}
      {!celebrationDismissed && (() => {
        const bookingsCount = EARNINGS_ROWS.length;
        const milestone =
          total >= 10000
            ? { eyebrow: "Milestone", title: `€${total.toLocaleString()} YTD — you crossed the €10k mark`, body: "Top quartile of platform earnings. Keep your channels healthy." }
            : total >= 5000
            ? { eyebrow: "Milestone", title: `€${total.toLocaleString()} YTD — €5k crossed`, body: "Reliable income. Halfway to a €10k year on the books." }
            : bookingsCount >= 10
            ? { eyebrow: "Milestone", title: `${bookingsCount} bookings closed this year`, body: "You've reached double digits. Repeat clients are usually next." }
            : total >= 1000
            ? { eyebrow: "Milestone", title: `€${total.toLocaleString()} this year — €1k mark crossed`, body: "Real, repeatable income. Keep reach healthy." }
            : bookingsCount >= 5
            ? { eyebrow: "Milestone", title: `${bookingsCount} bookings closed`, body: "Past your first handful. Patterns start to show now." }
            : null;
        if (!milestone) return null;
        // Drill-in to the most recent booking — the one that "tipped past" the threshold.
        const latestId = EARNINGS_ROWS[0]?.id;
        return (
          <div style={{ marginBottom: 16 }}>
            <CelebrationBanner
              tone="forest"
              eyebrow={milestone.eyebrow}
              title={milestone.title}
              body={milestone.body}
              primaryLabel={latestId ? "Open most recent booking" : undefined}
              onPrimary={latestId ? () => openDrawer("talent-closed-booking", { earningId: latestId }) : undefined}
              secondaryLabel="Share with my agency"
              onSecondary={() => undefined}
              onDismiss={() => setCelebrationDismissed(true)}
            />
          </div>
        );
      })()}

      {/* Audit #37 — Earnings goal progress ring. Goal is set via the
          ring's edit affordance; defaults to €30k/yr. Sits beside the
          forecast tile below for tight contextual coupling. */}
      <EarningsGoalRing total={total} />

      {/* Compact stat strip — same pattern as Reach hero */}
      <div
        data-tulala-stat-strip
        style={{
          display: "flex",
          alignItems: "center",
          gap: 0,
          padding: "12px 16px",
          background: "#fff",
          border: `1px solid ${COLORS.borderSoft}`,
          borderRadius: 10,
          marginBottom: 16,
        }}
      >
        <ReachStat label="Paid YTD" value={`€${total.toLocaleString()}`} caption={`across ${EARNINGS_ROWS.length} bookings`} tone="success" />
        <ReachStatDivider />
        <ReachStat label="Avg booking" value={`€${Math.round(total / EARNINGS_ROWS.length).toLocaleString()}`} caption="this year" tone="ink" />
        <ReachStatDivider />
        <ReachStat label="Top channel" value={topSourceLabel} caption={topSource ? `€${topSource[1].toLocaleString()}` : ""} tone="indigo" />
      </div>

      {/* Earnings forecast tile (E3). Naive projection — current YTD pace
          extrapolated to year-end, trimmed to a 12-month rolling average
          for stability. Production wires this to a real model that
          factors seasonality + booking-pipeline confidence. */}
      <ForecastTile total={total} bookingsCount={EARNINGS_ROWS.length} />

      {/* Filter chips per source */}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 16 }}>
        {([
          { key: "all" as const, label: "All", tone: COLORS.ink },
          { key: "agency" as const, label: "Agency", tone: COLORS.amber },
          { key: "personal" as const, label: "Personal page", tone: COLORS.royal },
          { key: "hub" as const, label: "Hubs", tone: COLORS.indigo },
          { key: "studio" as const, label: "Studios", tone: COLORS.green },
          { key: "manual" as const, label: "Off-platform", tone: COLORS.coral },
        ]).map((c) => {
          const active = filter === c.key;
          return (
            <button
              key={c.key}
              type="button"
              onClick={() => setFilter(c.key)}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                padding: "6px 11px",
                borderRadius: 999,
                background: active ? COLORS.fill : "#fff",
                border: `1px solid ${active ? COLORS.accent : COLORS.borderSoft}`,
                cursor: "pointer",
                fontFamily: FONTS.body,
                fontSize: 12.5,
                fontWeight: 500,
                color: active ? "#fff" : COLORS.ink,
              }}
            >
              {!active && (
                <span aria-hidden style={{ width: 6, height: 6, borderRadius: "50%", background: c.tone }} />
              )}
              <span>{c.label}</span>
              <span
                style={{
                  fontSize: 11,
                  color: active ? "rgba(255,255,255,0.6)" : COLORS.inkDim,
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                {counts[c.key]}
              </span>
            </button>
          );
        })}
      </div>

      <CapsLabel>
        {filter === "all" ? "All earnings" : `${filter.charAt(0).toUpperCase()}${filter.slice(1)} earnings`}
        {" · "}
        €{filteredTotal.toLocaleString()}
      </CapsLabel>

      <div
        style={{
          marginTop: 10,
          background: "#fff",
          border: `1px solid ${COLORS.borderSoft}`,
          borderRadius: 12,
          padding: "0 14px",
        }}
      >
        {filtered.length === 0 ? (
          <div style={{ padding: "32px 12px" }}>
            <EmptyState
              icon="info"
              title={
                filter === "manual"
                  ? "Nothing logged off-platform"
                  : filter === "agency" || filter === "personal" || filter === "hub" || filter === "studio"
                    ? `No ${filter} earnings yet`
                    : "No earnings here yet"
              }
              body={
                filter === "manual"
                  ? "Use Log work to record gigs you booked outside Tulala. Keeps your earnings story complete in one place."
                  : filter === "agency"
                    ? "When your agency closes a booking on your behalf, it lands here automatically."
                    : filter === "personal"
                      ? "Earnings from inquiries through your personal page route here. Keep your reach channels healthy."
                      : filter === "hub"
                        ? "Earnings from Tulala Hub bookings show up here once any close."
                        : filter === "studio"
                          ? "Studio bookings — open a studio relationship in Reach to start receiving these."
                          : "Once you start booking, this view becomes the story of your income."
              }
              compact
            />
          </div>
        ) : (
          // Audit #36 — group by month with header + month-total
          // sub-line. Months ordered most-recent first; rows preserve
          // the original sort within each group.
          (() => {
            type Group = { key: string; label: string; total: number; rows: typeof filtered };
            const groups: Group[] = [];
            const groupOrder = ["Apr 2026", "Mar 2026", "Feb 2026", "Jan 2026", "Dec 2025", "Nov 2025", "Oct 2025"];
            for (const e of filtered) {
              // Mock: payoutDate "Apr 25 2026" or "Apr 25" → month label "Apr 2026"
              const m = e.payoutDate.match(/([A-Za-z]{3})/)?.[1] ?? "";
              const y = e.payoutDate.match(/(20\d\d)/)?.[1] ?? "2026";
              const key = `${m} ${y}`;
              let g = groups.find((x) => x.key === key);
              if (!g) {
                g = { key, label: key, total: 0, rows: [] };
                groups.push(g);
              }
              g.rows.push(e);
              g.total += parseFloat(e.amount.replace(/[^0-9.]/g, "")) || 0;
            }
            groups.sort((a, b) => groupOrder.indexOf(a.key) - groupOrder.indexOf(b.key));
            return groups.map((g) => (
              <div key={g.key}>
                <div
                  style={{
                    display: "flex",
                    alignItems: "baseline",
                    justifyContent: "space-between",
                    padding: "12px 0 8px",
                    borderTop: groups.indexOf(g) === 0 ? "none" : `1px solid ${COLORS.borderSoft}`,
                    fontFamily: FONTS.body,
                  }}
                >
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 700,
                      letterSpacing: 0.7,
                      textTransform: "uppercase",
                      color: COLORS.inkMuted,
                    }}
                  >
                    {g.label}
                  </span>
                  <span style={{ fontSize: 12, color: COLORS.ink, fontVariantNumeric: "tabular-nums" }}>
                    €{g.total.toLocaleString()} · {g.rows.length} payout{g.rows.length === 1 ? "" : "s"}
                  </span>
                </div>
                {g.rows.map((e) => <EarningRow key={e.id} earning={e} />)}
              </div>
            ));
          })()
        )}
      </div>

      {/* Legacy table block — keep for the bottom secondary "Status" column,
          but compact; chevron drawer handler stays the same. */}
      <div style={{ display: "none" }}>
        {EARNINGS_ROWS.map((e) => (
          <button
            key={e.id}
            onClick={() => openDrawer("talent-earnings-detail", { id: e.id })}
            style={{ display: "none" }}
          >
            <span style={{ display: "inline-flex", justifyContent: "flex-end" }}>
              <Icon name="chevron-right" size={13} color={COLORS.inkDim} />
            </span>
          </button>
        ))}
      </div>
    </>
  );
}
