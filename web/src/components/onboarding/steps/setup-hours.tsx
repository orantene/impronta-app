"use client";

/** Step 3 weekly hours, Monday to Sunday. One range per day; tap a day to open or close it. */

import { useState } from "react";

import type { DayKey, WeeklyEssentialHours } from "@/lib/onboarding/essentials";
import { DAY_LABELS, DAY_ORDER, copyDayToAll, minToTime, setDayRange, timeToMin, toggleDay } from "@/lib/onboarding/setup";
import type { SetupCopy } from "@/lib/onboarding/setup-copy";
import type { FlowLocale } from "@/lib/onboarding/flow";

const field = { background: "var(--tl-surface-raised)", border: "1px solid var(--tl-hairline)", color: "var(--tl-ink)" } as const;

export function SetupHours({
  copy,
  locale,
  week,
  onChange,
}: {
  copy: SetupCopy;
  locale: FlowLocale;
  week: WeeklyEssentialHours;
  onChange: (next: WeeklyEssentialHours) => void;
}) {
  const firstOpen = DAY_ORDER.find((d) => week[d].length > 0) ?? null;
  const [active, setActive] = useState<DayKey | null>(firstOpen);
  const range = active ? week[active][0] ?? null : null;
  return (
    <div data-testid="onb-setup-hours">
      <p className="mb-2 text-[0.8125rem]" style={{ color: "var(--tl-ink-soft)" }}>{copy.hoursHint}</p>
      <div className="grid grid-cols-7 gap-1.5" role="group" aria-label={copy.hours}>
        {DAY_ORDER.map((d) => {
          const open = week[d].length > 0;
          return (
            <button
              key={d}
              type="button"
              aria-pressed={open}
              onClick={() => {
                onChange(toggleDay(week, d));
                setActive(open ? (active === d ? null : active) : d);
              }}
              data-testid={`onb-day-${d}`}
              className="min-h-12 rounded-[12px] text-[0.75rem] font-semibold"
              style={{
                background: open ? "var(--tl-forest)" : "var(--tl-surface-raised)",
                color: open ? "var(--tl-forest-on)" : "var(--tl-ink-soft)",
                border: `1px solid ${active === d ? "var(--tl-forest)" : "var(--tl-hairline)"}`,
              }}
            >
              {DAY_LABELS[locale][d]}
            </button>
          );
        })}
      </div>
      {active && range ? (
        <div className="mt-3 rounded-[18px] p-3" style={{ background: "var(--tl-surface)", border: "1px solid var(--tl-hairline)" }}>
          <div className="grid grid-cols-2 gap-2">
            {(["startMin", "endMin"] as const).map((k) => (
              <label key={k} className="block">
                <span className="mb-1 block text-[0.6875rem] font-semibold uppercase tracking-[0.08em]" style={{ color: "var(--tl-muted)" }}>{k === "startMin" ? copy.from : copy.to}</span>
                <input
                  type="time"
                  step={900}
                  value={minToTime(range[k])}
                  onChange={(e) => {
                    const m = timeToMin(e.target.value);
                    if (m !== null) onChange(setDayRange(week, active, { ...range, [k]: m }));
                  }}
                  data-testid={`onb-hours-${k}`}
                  className="h-12 w-full rounded-[12px] px-3 text-[1rem] outline-none"
                  style={field}
                />
              </label>
            ))}
          </div>
          <button type="button" onClick={() => onChange(copyDayToAll(week, active))} data-testid="onb-hours-apply-all" className="mt-2 min-h-11 text-[0.8125rem] font-medium underline underline-offset-4" style={{ color: "var(--tl-forest)" }}>
            {copy.applyAll}
          </button>
        </div>
      ) : (
        <p className="mt-2 text-[0.8125rem]" style={{ color: "var(--tl-muted)" }}>{copy.closed}</p>
      )}
    </div>
  );
}
