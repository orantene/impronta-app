"use client";

import { useState } from "react";
import { COLORS, FONTS } from "@/components/admin/shell/internal/state";
import { formatEurCents } from "@/lib/talent/earnings-view";
import { useResolvedTalentEarnings } from "./use-resolved-talent-earnings";

function KpiCard({
  label,
  value,
  caption,
  tone = "ink",
}: {
  label: string;
  value: string;
  caption: string;
  tone?: "ink" | "success" | "indigo";
}) {
  const toneFg =
    tone === "success" ? COLORS.successDeep : tone === "indigo" ? COLORS.indigoDeep : COLORS.ink;
  const toneBg =
    tone === "success" ? COLORS.successSoft : tone === "indigo" ? COLORS.indigoSoft : "rgba(11,11,13,0.04)";

  return (
    <div
      style={{
        background: "#fff",
        border: `1px solid ${COLORS.borderSoft}`,
        borderRadius: 12,
        padding: "14px 16px",
        fontFamily: FONTS.body,
        display: "flex",
        flexDirection: "column",
        gap: 8,
      }}
    >
      <div
        style={{
          display: "inline-flex",
          alignSelf: "flex-start",
          alignItems: "center",
          padding: "3px 8px",
          borderRadius: 999,
          background: toneBg,
          color: toneFg,
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: 0.5,
          textTransform: "uppercase",
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontFamily: FONTS.display,
          fontSize: 24,
          fontWeight: 600,
          letterSpacing: -0.4,
          color: COLORS.ink,
          fontVariantNumeric: "tabular-nums",
          lineHeight: 1.15,
        }}
      >
        {value}
      </div>
      <div style={{ fontSize: 12, color: COLORS.inkMuted, lineHeight: 1.4 }}>{caption}</div>
    </div>
  );
}

function EarningsGoalRing({ ytdNetCents }: { ytdNetCents: number }) {
  const [goal, setGoal] = useState(30000_00);
  const [editOpen, setEditOpen] = useState(false);
  const [editValue, setEditValue] = useState("");

  const total = ytdNetCents / 100;
  const goalEur = goal / 100;
  const monthsElapsed = 4;
  const expectedByNow = (goalEur / 12) * monthsElapsed;
  const paceRatio = expectedByNow > 0 ? total / expectedByNow : 0;
  const paceLabel = paceRatio >= 1 ? "On track" : paceRatio >= 0.7 ? "Slightly behind" : "Behind pace";
  const paceFg =
    paceRatio >= 1
      ? COLORS.successDeep
      : paceRatio >= 0.7
        ? COLORS.amberDeep
        : COLORS.criticalDeep;
  const paceBg =
    paceRatio >= 1
      ? COLORS.successSoft
      : paceRatio >= 0.7
        ? COLORS.amberSoft
        : COLORS.criticalSoft;
  const strokeTone =
    paceRatio >= 1 ? COLORS.success : paceRatio >= 0.7 ? COLORS.amber : COLORS.critical;
  const pct = Math.min(1, total / goalEur);
  const radius = 32;
  const circumference = 2 * Math.PI * radius;
  const dash = circumference * pct;

  return (
    <section
      style={{
        display: "flex",
        alignItems: "center",
        gap: 16,
        padding: "16px 18px",
        background: `linear-gradient(135deg, ${COLORS.surfaceAlt} 0%, #fff 70%)`,
        border: `1px solid ${COLORS.borderSoft}`,
        borderRadius: 14,
        fontFamily: FONTS.body,
      }}
    >
      <div style={{ position: "relative", width: 80, height: 80, flexShrink: 0 }}>
        <svg width={80} height={80} viewBox="0 0 80 80" aria-hidden>
          <circle cx={40} cy={40} r={radius} fill="none" stroke="rgba(11,11,13,0.08)" strokeWidth={5.5} />
          <circle
            cx={40}
            cy={40}
            r={radius}
            fill="none"
            stroke={strokeTone}
            strokeWidth={5.5}
            strokeLinecap="round"
            strokeDasharray={`${dash} ${circumference}`}
            transform="rotate(-90 40 40)"
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
              fontSize: 17,
              fontWeight: 600,
              color: COLORS.ink,
              fontVariantNumeric: "tabular-nums",
              letterSpacing: -0.3,
            }}
          >
            {Math.round(pct * 100)}%
          </span>
          <span
            style={{
              fontSize: 8.5,
              fontWeight: 700,
              letterSpacing: 0.7,
              textTransform: "uppercase",
              color: COLORS.inkMuted,
            }}
          >
            of goal
          </span>
        </div>
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            flexWrap: "wrap",
            gap: 8,
            marginBottom: 4,
          }}
        >
          <span
            style={{
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: 0.8,
              textTransform: "uppercase",
              color: COLORS.inkMuted,
            }}
          >
            2026 earnings goal
          </span>
          <span
            style={{
              padding: "2px 8px",
              borderRadius: 999,
              background: paceBg,
              color: paceFg,
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: 0.4,
            }}
          >
            {paceLabel}
          </span>
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "baseline",
            gap: 8,
            flexWrap: "wrap",
          }}
        >
          <span
            style={{
              fontFamily: FONTS.display,
              fontSize: 22,
              fontWeight: 600,
              color: COLORS.ink,
              letterSpacing: -0.4,
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {formatEurCents(ytdNetCents)}
          </span>
          <span style={{ fontSize: 12, color: COLORS.inkMuted }}>of {formatEurCents(goal)}</span>
        </div>
        <div style={{ marginTop: 4, fontSize: 12, color: COLORS.inkMuted, lineHeight: 1.5 }}>
          {formatEurCents(Math.max(0, goal - ytdNetCents))} to go · expected by now ≈ {formatEurCents(Math.round(expectedByNow * 100))}
        </div>
        {editOpen ? (
          <div style={{ marginTop: 10, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <span style={{ fontSize: 12, color: COLORS.inkMuted }}>€</span>
            <input
              type="text"
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              autoFocus
              style={{
                width: 96,
                padding: "5px 8px",
                fontSize: 12.5,
                border: `1px solid ${COLORS.border}`,
                borderRadius: 7,
                fontFamily: FONTS.body,
                color: COLORS.ink,
              }}
            />
            <button
              type="button"
              style={{
                padding: "5px 10px",
                fontSize: 12,
                fontWeight: 600,
                background: COLORS.fill,
                color: "#fff",
                border: "none",
                borderRadius: 7,
                cursor: "pointer",
                fontFamily: FONTS.body,
              }}
              onClick={() => {
                const next = parseInt(editValue.replace(/[^0-9]/g, ""), 10);
                if (next > 0) setGoal(next * 100);
                setEditOpen(false);
              }}
            >
              Save
            </button>
            <button
              type="button"
              style={{
                padding: "5px 8px",
                fontSize: 12,
                background: "transparent",
                border: "none",
                color: COLORS.inkMuted,
                cursor: "pointer",
                fontFamily: FONTS.body,
              }}
              onClick={() => setEditOpen(false)}
            >
              Cancel
            </button>
          </div>
        ) : (
          <button
            type="button"
            style={{
              marginTop: 6,
              padding: 0,
              fontSize: 12,
              fontWeight: 600,
              background: "transparent",
              border: "none",
              color: COLORS.ink,
              cursor: "pointer",
              fontFamily: FONTS.body,
            }}
            onClick={() => {
              setEditValue(String(goal / 100));
              setEditOpen(true);
            }}
          >
            Edit goal →
          </button>
        )}
      </div>
    </section>
  );
}

export function MoneyKpiStrip() {
  const earnings = useResolvedTalentEarnings();
  const { totals, rows } = earnings;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
          gap: 12,
        }}
      >
        <KpiCard
          label="YTD net"
          value={formatEurCents(totals.ytdNetCents)}
          caption={`${rows.length} booking${rows.length === 1 ? "" : "s"} paid or logged`}
          tone="success"
        />
        <KpiCard
          label="Pending"
          value={formatEurCents(totals.pendingCents)}
          caption="Invoiced · awaiting payout"
          tone="indigo"
        />
        <KpiCard
          label="Confirmed pipeline"
          value={formatEurCents(totals.confirmedPipelineCents)}
          caption="Booked · not yet invoiced"
        />
      </div>
      <EarningsGoalRing ytdNetCents={totals.ytdNetCents} />
    </div>
  );
}
