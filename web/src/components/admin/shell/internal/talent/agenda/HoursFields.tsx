"use client";

import { useState } from "react";

import {
  formatHoursDate,
  hoursDatePlaceholder,
  minuteChoices,
  parseHoursDate,
  usesTwentyFourHour,
} from "@/lib/talent-agenda/hours-display-format";

const FIELD = "rounded-xl border border-black/10 bg-white px-2 py-2 text-[14px]";

/**
 * A clock-time field for the Working hours editor. The value is always "HH:MM".
 * Spanish dashboards get a 24h hour + minute pair (the browser's own time input
 * would follow the operating system and print AM/PM); English keeps the native
 * input. DS-39.
 */
export function HoursTimeField({
  value,
  onChange,
  locale,
  label,
  hourLabel,
  minuteLabel,
}: {
  value: string;
  onChange: (hhmm: string) => void;
  locale: string;
  label: string;
  hourLabel: string;
  minuteLabel: string;
}) {
  if (!usesTwentyFourHour(locale)) {
    return (
      <input
        type="time"
        aria-label={label}
        className={`${FIELD} w-full min-w-0`}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    );
  }
  const m = /^(\d{1,2}):(\d{2})$/.exec(value);
  const h = m ? Math.min(23, Number(m[1])) : 10;
  const min = m ? Number(m[2]) : 0;
  const set = (nh: number, nm: number) =>
    onChange(`${String(nh).padStart(2, "0")}:${String(nm).padStart(2, "0")}`);
  return (
    <span role="group" aria-label={label} className="flex items-center gap-1">
      <select
        aria-label={`${label}: ${hourLabel}`}
        className={`${FIELD} min-w-0 flex-1`}
        value={h}
        onChange={(e) => set(Number(e.target.value), min)}
      >
        {Array.from({ length: 24 }, (_, i) => (
          <option key={i} value={i}>
            {String(i).padStart(2, "0")}
          </option>
        ))}
      </select>
      <span aria-hidden className="text-[13px] text-black/60">:</span>
      <select
        aria-label={`${label}: ${minuteLabel}`}
        className={`${FIELD} min-w-0 flex-1`}
        value={min}
        onChange={(e) => set(h, Number(e.target.value))}
      >
        {minuteChoices(min).map((v) => (
          <option key={v} value={v}>
            {String(v).padStart(2, "0")}
          </option>
        ))}
      </select>
    </span>
  );
}

/**
 * A calendar-date field. The value is always ISO "YYYY-MM-DD". Spanish shows
 * and accepts dd/mm/aaaa; English keeps the native date input. DS-39.
 */
export function HoursDateField({
  value,
  onChange,
  locale,
  label,
}: {
  value: string;
  onChange: (iso: string) => void;
  locale: string;
  label: string;
}) {
  const es = locale.toLowerCase().startsWith("es");
  const [draft, setDraft] = useState<string | null>(null);
  if (!es) {
    return (
      <input
        type="date"
        aria-label={label}
        className="mt-1 block rounded-xl border border-black/10 px-3 py-2"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    );
  }
  return (
    <input
      type="text"
      inputMode="numeric"
      autoComplete="off"
      aria-label={label}
      placeholder={hoursDatePlaceholder(locale)}
      maxLength={10}
      className="mt-1 block w-[140px] rounded-xl border border-black/10 px-3 py-2"
      value={draft ?? formatHoursDate(value, locale)}
      onChange={(e) => {
        const text = e.target.value;
        setDraft(text);
        const iso = parseHoursDate(text, locale);
        onChange(iso ?? "");
      }}
      onBlur={() => setDraft(null)}
    />
  );
}
