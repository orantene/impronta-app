"use client";

// Phase 3 — workspace Calendar client shell.
// Interactive month-grid calendar reading real inquiry event_date data.
// Matches the prototype CalendarPage design in _pages.tsx lines 3902–4140.

import { useState, useCallback } from "react";
import type { CalendarEvent } from "../../_data-bridge";

// ─── Design tokens ────────────────────────────────────────────────────────────

const C = {
  ink:        "#0B0B0D",
  inkMuted:   "rgba(11,11,13,0.55)",
  inkDim:     "rgba(11,11,13,0.35)",
  border:     "rgba(24,24,27,0.08)",
  borderSoft: "rgba(24,24,27,0.06)",
  cardBg:     "#ffffff",
  surface:    "rgba(11,11,13,0.02)",
  surfaceAlt: "rgba(11,11,13,0.03)",
  accent:     "#0F4F3E",
  green:      "#2E7D5B",
  greenSoft:  "rgba(46,125,91,0.09)",
  amber:      "#B8860B",
  amberSoft:  "rgba(184,134,11,0.10)",
  red:        "#c0392b",
  redSoft:    "rgba(192,57,43,0.08)",
} as const;

const FONT = '"Inter", system-ui, sans-serif';
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

// ─── Status → tone mapping ────────────────────────────────────────────────────

type Tone = "green" | "amber" | "red" | "ink";

function statusTone(status: string): Tone {
  if (status === "booked" || status === "converted") return "green";
  if (["approved", "offer_pending", "submitted", "talent_suggested"].includes(status)) return "amber";
  if (["rejected", "expired", "closed_lost"].includes(status)) return "red";
  return "ink";
}

function toneColor(tone: Tone) {
  if (tone === "green") return { text: C.green, bg: C.greenSoft };
  if (tone === "amber") return { text: C.amber, bg: C.amberSoft };
  if (tone === "red")   return { text: C.red,   bg: C.redSoft };
  return { text: C.inkMuted, bg: "rgba(11,11,13,0.05)" };
}

// ─── Relative time ────────────────────────────────────────────────────────────

function relTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60_000);
  if (m < 2)  return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

// ─── Nav button ───────────────────────────────────────────────────────────────

function NavBtn({
  label,
  onClick,
  disabled,
}: {
  label: "prev" | "next" | "Today";
  onClick: () => void;
  disabled?: boolean;
}) {
  const [hovered, setHovered] = useState(false);
  const ariaLabel = label === "prev" ? "Previous month" : label === "next" ? "Next month" : "Go to today";
  const content =
    label === "prev" ? (
      <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
        <path d="M15 6l-6 6 6 6" />
      </svg>
    ) : label === "next" ? (
      <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
        <path d="M9 6l6 6-6 6" />
      </svg>
    ) : (
      "Today"
    );

  return (
    <button
      type="button"
      aria-label={ariaLabel}
      onClick={onClick}
      disabled={disabled}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        padding: label === "Today" ? "5px 10px" : "5px 8px",
        background: "transparent",
        border: `1px solid ${hovered && !disabled ? C.border : C.borderSoft}`,
        borderRadius: 6,
        cursor: disabled ? "default" : "pointer",
        fontFamily: FONT,
        fontSize: 12,
        color: disabled ? C.inkDim : hovered ? C.ink : C.inkMuted,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        transition: "border-color 120ms, color 120ms",
        opacity: disabled ? 0.5 : 1,
      }}
    >
      {content}
    </button>
  );
}

// ─── Status strip ─────────────────────────────────────────────────────────────

function StatusStrip({
  confirmed,
  pending,
  inProgress,
  expired,
}: {
  confirmed: number;
  pending: number;
  inProgress: number;
  expired: number;
}) {
  const items = [
    { label: "Confirmed",   value: confirmed,  color: C.green },
    { label: "Pending",     value: pending,    color: C.amber },
    { label: "In progress", value: inProgress, color: C.inkMuted },
    { label: "Expired",     value: expired,    color: C.red },
  ];
  return (
    <div
      style={{
        display: "flex",
        gap: 2,
        flexWrap: "wrap",
      }}
    >
      {items.map(({ label, value, color }) => (
        <div
          key={label}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 7,
            padding: "8px 14px",
            background: C.cardBg,
            border: `1px solid ${C.borderSoft}`,
            borderRadius: 8,
            flex: "1 1 120px",
          }}
        >
          <span
            aria-hidden
            style={{ width: 7, height: 7, borderRadius: "50%", background: color, flexShrink: 0 }}
          />
          <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
            <span style={{ fontFamily: FONT, fontSize: 22, fontWeight: 600, color: C.ink, letterSpacing: -0.8, lineHeight: 1 }}>
              {value}
            </span>
            <span style={{ fontFamily: FONT, fontSize: 10.5, fontWeight: 500, color: C.inkMuted, letterSpacing: 0.1 }}>
              {label}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Main shell ───────────────────────────────────────────────────────────────

export function CalendarShell({
  events,
  tenantSlug,
}: {
  events: CalendarEvent[];
  tenantSlug: string;
}) {
  const today = new Date();
  const [displayYear, setDisplayYear]   = useState(today.getFullYear());
  const [displayMonth, setDisplayMonth] = useState(today.getMonth());

  const goToPrev = useCallback(() => {
    setDisplayMonth((m) => {
      if (m === 0) { setDisplayYear((y) => y - 1); return 11; }
      return m - 1;
    });
  }, []);

  const goToNext = useCallback(() => {
    setDisplayMonth((m) => {
      if (m === 11) { setDisplayYear((y) => y + 1); return 0; }
      return m + 1;
    });
  }, []);

  const goToToday = useCallback(() => {
    setDisplayYear(today.getFullYear());
    setDisplayMonth(today.getMonth());
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const year  = displayYear;
  const month = displayMonth;
  const daysInMonth  = new Date(year, month + 1, 0).getDate();
  const firstWeekday = new Date(year, month, 1).getDay();
  const isCurrentMonth = year === today.getFullYear() && month === today.getMonth();

  const monthLabel = new Date(year, month, 1).toLocaleString("en-US", {
    month: "long",
    year: "numeric",
  });

  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone.replace("_", " ");
  const tzShort =
    new Intl.DateTimeFormat("en-US", { timeZoneName: "short" })
      .formatToParts(new Date())
      .find((p) => p.type === "timeZoneName")?.value ?? "local";

  // Build day→events map for displayed month
  const dayMap: Record<number, { id: string; title: string; tone: Tone }[]> = {};

  for (const ev of events) {
    if (!ev.event_date) continue;
    const d = new Date(ev.event_date + "T12:00:00"); // noon avoids TZ edge-cases
    if (d.getFullYear() !== year || d.getMonth() !== month) continue;
    const day = d.getDate();
    const label = ev.company ? `${ev.company} — ${ev.contact_name}` : ev.contact_name;
    if (!dayMap[day]) dayMap[day] = [];
    dayMap[day].push({ id: ev.id, title: label.slice(0, 28), tone: statusTone(ev.status) });
  }

  // Status strip counts for this month
  const allMonthEvents = Object.values(dayMap).flat();
  const confirmed  = allMonthEvents.filter((e) => e.tone === "green").length;
  const pending    = allMonthEvents.filter((e) => e.tone === "amber").length;
  const inProgress = allMonthEvents.filter((e) => e.tone === "ink").length;
  const expired    = allMonthEvents.filter((e) => e.tone === "red").length;

  const totalEvents = events.length;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, fontFamily: FONT }}>

      {/* Status strip */}
      <StatusStrip
        confirmed={confirmed}
        pending={pending}
        inProgress={inProgress}
        expired={expired}
      />

      {/* Calendar card */}
      <div
        style={{
          background: C.cardBg,
          border: `1px solid ${C.borderSoft}`,
          borderRadius: 12,
          overflow: "hidden",
        }}
      >
        {/* Header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "12px 14px",
            borderBottom: `1px solid ${C.borderSoft}`,
          }}
        >
          <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: C.ink }}>{monthLabel}</div>
            <div
              title={`All times are local. Adjust in Settings → Integrations.`}
              style={{
                fontSize: 10.5,
                fontWeight: 500,
                color: C.inkMuted,
                background: C.surfaceAlt,
                padding: "2px 6px",
                borderRadius: 5,
                cursor: "default",
              }}
            >
              {tz} · {tzShort}
            </div>
          </div>
          <div style={{ display: "flex", gap: 4 }}>
            <NavBtn label="prev"  onClick={goToPrev} />
            <NavBtn label="Today" onClick={goToToday} disabled={isCurrentMonth} />
            <NavBtn label="next"  onClick={goToNext} />
          </div>
        </div>

        {/* Weekday headers */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(7, 1fr)",
            background: C.surface,
            borderBottom: `1px solid ${C.borderSoft}`,
          }}
        >
          {WEEKDAYS.map((d) => (
            <div
              key={d}
              style={{
                padding: "8px 10px",
                fontSize: 11,
                fontWeight: 600,
                color: C.inkMuted,
                fontFamily: FONT,
              }}
            >
              {d}
            </div>
          ))}
        </div>

        {/* Day grid */}
        <div
          role="grid"
          aria-label={`Calendar — ${monthLabel}`}
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(7, 1fr)",
            gridAutoRows: "minmax(88px, auto)",
          }}
        >
          {/* Padding cells */}
          {Array.from({ length: firstWeekday }).map((_, i) => (
            <div
              key={`pad-${i}`}
              role="gridcell"
              aria-hidden
              style={{ background: C.surface, borderTop: `1px solid ${C.borderSoft}` }}
            />
          ))}

          {/* Day cells */}
          {Array.from({ length: daysInMonth }).map((_, i) => {
            const day       = i + 1;
            const dayEvents = dayMap[day] ?? [];
            const isToday   = isCurrentMonth && day === today.getDate();
            const isoDate   = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
            const ariaLabel = `${monthLabel.split(" ")[0]} ${day}${dayEvents.length > 0 ? `, ${dayEvents.length} event${dayEvents.length !== 1 ? "s" : ""}` : ""}${isToday ? " (today)" : ""}`;
            const colIndex  = (firstWeekday + i) % 7;

            return (
              <DayCell
                key={day}
                day={day}
                ariaLabel={ariaLabel}
                isToday={isToday}
                isoDate={isoDate}
                dayEvents={dayEvents}
                colIndex={colIndex}
                tenantSlug={tenantSlug}
              />
            );
          })}
        </div>
      </div>

      {/* Empty state */}
      {totalEvents === 0 && (
        <div
          style={{
            textAlign: "center",
            padding: "24px 0",
            fontFamily: FONT,
            fontSize: 13,
            color: C.inkMuted,
          }}
        >
          No bookings with dates yet.{" "}
          <a href={`/${tenantSlug}/admin/work`} style={{ color: C.accent, textDecoration: "underline" }}>
            Open an inquiry
          </a>{" "}
          and set an event date to see it here.
        </div>
      )}
    </div>
  );
}

// ─── Day cell (extracted to avoid per-cell setState closures) ─────────────────

function DayCell({
  day,
  ariaLabel,
  isToday,
  isoDate,
  dayEvents,
  colIndex,
  tenantSlug,
}: {
  day: number;
  ariaLabel: string;
  isToday: boolean;
  isoDate: string;
  dayEvents: { id: string; title: string; tone: Tone }[];
  colIndex: number;
  tenantSlug: string;
}) {
  const [hovered, setHovered] = useState(false);
  void isoDate; // reserved for future day-detail drawer
  void tenantSlug;

  return (
    <div
      role="gridcell"
      aria-label={ariaLabel}
      tabIndex={0}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        padding: "8px 10px",
        borderTop: `1px solid ${C.borderSoft}`,
        borderLeft: colIndex === 0 ? "none" : `1px solid ${C.borderSoft}`,
        display: "flex",
        flexDirection: "column",
        gap: 4,
        background: hovered ? "rgba(11,11,13,0.025)" : "transparent",
        transition: "background 120ms",
      }}
    >
      {/* Day number */}
      <div
        style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          width: isToday ? 22 : "auto",
          height: isToday ? 22 : "auto",
          background: isToday ? C.accent : "transparent",
          borderRadius: isToday ? 999 : 0,
          fontSize: 12,
          fontWeight: isToday ? 700 : 500,
          color: isToday ? "#fff" : C.ink,
          fontVariantNumeric: "tabular-nums",
          fontFamily: FONT,
        }}
      >
        {day}
      </div>

      {/* Event chips (max 2 visible) */}
      {dayEvents.slice(0, 2).map((ev, idx) => {
        const { text, bg } = toneColor(ev.tone);
        return (
          <EventChip key={idx} title={ev.title} text={text} bg={bg} />
        );
      })}

      {/* Overflow count */}
      {dayEvents.length > 2 && (
        <span style={{ fontSize: 10, color: C.accent, fontWeight: 600, fontFamily: FONT }}>
          +{dayEvents.length - 2} more
        </span>
      )}
    </div>
  );
}

// ─── Event chip ───────────────────────────────────────────────────────────────

function EventChip({
  title,
  text,
  bg,
}: {
  title: string;
  text: string;
  bg: string;
}) {
  return (
    <div
      style={{
        fontSize: 10.5,
        color: text,
        background: bg,
        padding: "2px 6px",
        borderRadius: 5,
        fontWeight: 500,
        whiteSpace: "nowrap",
        overflow: "hidden",
        textOverflow: "ellipsis",
        fontFamily: FONT,
        width: "100%",
      }}
      title={title}
    >
      {title}
    </div>
  );
}
