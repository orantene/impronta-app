"use client";

import { useState } from "react";
import { formatEurCents } from "@/lib/talent/earnings-view";
import { useResolvedTalentEarnings } from "./use-resolved-talent-earnings";

function EarningsGoalRing({ ytdNetCents }: { ytdNetCents: number }) {
  const [goal, setGoal] = useState(30000_00);
  const [editOpen, setEditOpen] = useState(false);
  const [editValue, setEditValue] = useState("");

  const total = ytdNetCents / 100;
  const goalEur = goal / 100;
  const monthsElapsed = 4;
  const expectedByNow = (goalEur / 12) * monthsElapsed;
  const paceRatio = expectedByNow > 0 ? total / expectedByNow : 0;
  const tone =
    paceRatio >= 1
      ? "text-emerald-700 bg-emerald-50 ring-emerald-200"
      : paceRatio >= 0.7
        ? "text-amber-800 bg-amber-50 ring-amber-200"
        : "text-rose-700 bg-rose-50 ring-rose-200";
  const strokeTone =
    paceRatio >= 1 ? "#15803d" : paceRatio >= 0.7 ? "#b45309" : "#e11d48";
  const paceLabel =
    paceRatio >= 1 ? "On track" : paceRatio >= 0.7 ? "Slightly behind" : "Behind pace";
  const pct = Math.min(1, total / goalEur);
  const radius = 36;
  const circumference = 2 * Math.PI * radius;
  const dash = circumference * pct;

  return (
    <section className="flex items-center gap-4 rounded-xl border border-border bg-card p-4 lg:p-5">
      <div className="relative h-[88px] w-[88px] shrink-0">
        <svg width={88} height={88} viewBox="0 0 88 88" aria-hidden>
          <circle cx={44} cy={44} r={radius} fill="none" stroke="rgba(11,11,13,0.08)" strokeWidth={6} />
          <circle
            cx={44}
            cy={44}
            r={radius}
            fill="none"
            stroke={strokeTone}
            strokeWidth={6}
            strokeLinecap="round"
            strokeDasharray={`${dash} ${circumference}`}
            transform="rotate(-90 44 44)"
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="font-display text-lg font-semibold text-foreground">
            {Math.round(pct * 100)}%
          </span>
          <span className="text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">
            of goal
          </span>
        </div>
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
          2026 earnings goal
        </div>
        <div className="mt-1 flex flex-wrap items-baseline gap-2">
          <span className="font-display text-xl font-medium text-foreground">
            {formatEurCents(ytdNetCents)}
          </span>
          <span className="text-xs text-muted-foreground">
            of {formatEurCents(goal)}
          </span>
          <span className={`ml-auto rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ${tone}`}>
            {paceLabel}
          </span>
        </div>
        <div className="mt-1 text-xs text-muted-foreground">
          {formatEurCents(Math.max(0, goal - ytdNetCents))} to go · expected by now ≈{" "}
          {formatEurCents(Math.round(expectedByNow * 100))}
        </div>
        {editOpen ? (
          <div className="mt-2 flex items-center gap-2">
            <span className="text-xs text-muted-foreground">€</span>
            <input
              type="text"
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              autoFocus
              className="w-24 rounded-md border border-border bg-background px-2 py-1 text-xs"
            />
            <button
              type="button"
              className="rounded-md bg-foreground px-2.5 py-1 text-xs font-semibold text-background"
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
              className="text-xs text-muted-foreground"
              onClick={() => setEditOpen(false)}
            >
              Cancel
            </button>
          </div>
        ) : (
          <button
            type="button"
            className="mt-2 text-xs font-semibold text-indigo-600 hover:text-indigo-700"
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

function KpiCard({
  label,
  value,
  caption,
}: {
  label: string;
  value: string;
  caption: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
        {label}
      </div>
      <div className="mt-1 font-display text-2xl font-medium tabular-nums text-foreground">
        {value}
      </div>
      <div className="mt-1 text-xs text-muted-foreground">{caption}</div>
    </div>
  );
}

export function MoneyKpiStrip() {
  const earnings = useResolvedTalentEarnings();
  const { totals, rows } = earnings;

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <KpiCard
          label="YTD net"
          value={formatEurCents(totals.ytdNetCents)}
          caption={`${rows.length} booking${rows.length === 1 ? "" : "s"} paid or logged`}
        />
        <KpiCard
          label="Pending"
          value={formatEurCents(totals.pendingCents)}
          caption="Invoiced · awaiting payout"
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
