"use client";

// Phase 3.12 — workspace Calendar client shell.
// Interactive month-grid calendar reading real inquiry event_date data.
// Matches the prototype CalendarPage design in _pages.tsx lines 3902–4140.
// 3.12 additions: day-detail slide-in panel on cell click.

import React, { useState, useCallback, useEffect } from "react";
import Link from "next/link";
import type { CalendarEvent } from "../../_data-bridge";
import { WorkspaceDrawer } from "../_components/WorkspaceDrawer";

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
  greenDeep:  "#0F4F3E",
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
  activeTone,
  onFilter,
}: {
  confirmed: number;
  pending: number;
  inProgress: number;
  expired: number;
  activeTone: Tone | null;
  onFilter: (tone: Tone | null) => void;
}) {
  const items: { label: string; value: number; color: string; tone: Tone }[] = [
    { label: "Confirmed",   value: confirmed,  color: C.green,   tone: "green" },
    { label: "Submitted",   value: pending,    color: C.amber,   tone: "amber" },
    { label: "In progress", value: inProgress, color: C.inkMuted, tone: "ink" },
    { label: "Expired",     value: expired,    color: C.red,     tone: "red" },
  ];
  return (
    <div
      style={{
        display: "flex",
        gap: 2,
        flexWrap: "wrap",
      }}
    >
      {items.map(({ label, value, color, tone }) => {
        const isActive = activeTone === tone;
        return (
          <button
            key={label}
            type="button"
            onClick={() => onFilter(isActive ? null : tone)}
            aria-pressed={isActive}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 7,
              padding: "8px 14px",
              background: isActive ? `${color}14` : C.cardBg,
              border: `1px solid ${isActive ? color + "55" : C.borderSoft}`,
              borderRadius: 8,
              flex: "1 1 120px",
              cursor: "pointer",
              transition: "background 120ms, border-color 120ms",
              fontFamily: FONT,
              outline: "none",
            }}
          >
            <span
              aria-hidden
              style={{ width: 7, height: 7, borderRadius: "50%", background: color, flexShrink: 0 }}
            />
            <div style={{ display: "flex", flexDirection: "column", gap: 1, textAlign: "left" }}>
              <span style={{ fontSize: 22, fontWeight: 600, color: isActive ? color : C.ink, letterSpacing: -0.8, lineHeight: 1 }}>
                {value}
              </span>
              <span style={{ fontSize: 10.5, fontWeight: isActive ? 700 : 500, color: isActive ? color : C.inkMuted, letterSpacing: 0.1 }}>
                {label}
              </span>
            </div>
          </button>
        );
      })}
    </div>
  );
}

// ─── Main shell ───────────────────────────────────────────────────────────────

// ─── New booking drawer ───────────────────────────────────────────────────────

function NewBookingDrawer({
  tenantSlug,
  preselectedDate,
  onClose,
}: {
  tenantSlug: string;
  preselectedDate: string | null;
  onClose: () => void;
}) {
  const displayDate = preselectedDate
    ? (() => {
        const parts = preselectedDate.split("-");
        return new Date(
          parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2])
        ).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });
      })()
    : null;

  return (
    <div style={{ fontFamily: FONT, color: C.ink }}>
      {/* Header */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "14px 20px 12px", borderBottom: `1px solid ${C.border}`,
        position: "sticky", top: 0, background: "#FAFAF7", zIndex: 1,
      }}>
        <div>
          <p style={{ fontFamily: FONT, fontSize: 11, fontWeight: 600, color: C.inkMuted, letterSpacing: 0.6, textTransform: "uppercase", margin: 0 }}>
            Calendar
          </p>
          <h2 style={{ fontFamily: FONT, fontSize: 18, fontWeight: 600, color: C.ink, letterSpacing: -0.2, margin: "2px 0 0" }}>
            New booking
          </h2>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          style={{
            width: 30, height: 30, borderRadius: "50%",
            border: `1px solid ${C.borderSoft}`, background: C.cardBg,
            cursor: "pointer", fontSize: 18, color: C.inkMuted,
            display: "inline-flex", alignItems: "center", justifyContent: "center",
            fontFamily: FONT,
          }}
        >
          ×
        </button>
      </div>

      {/* Body */}
      <div style={{ padding: "24px 20px 32px", display: "flex", flexDirection: "column", gap: 20 }}>
        {/* Date chip */}
        {displayDate ? (
          <div style={{
            display: "inline-flex", alignItems: "center", gap: 8,
            padding: "8px 14px", borderRadius: 10,
            background: C.greenSoft, border: `1px solid rgba(46,125,91,0.18)`,
          }}>
            <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke={C.green} strokeWidth={2} strokeLinecap="round">
              <rect x={3} y={4} width={18} height={18} rx={2} />
              <path d="M16 2v4M8 2v4M3 10h18" />
            </svg>
            <span style={{ fontSize: 13, fontWeight: 600, color: C.green }}>{displayDate}</span>
          </div>
        ) : (
          <div style={{
            padding: "12px 16px", borderRadius: 10,
            background: C.surface, border: `1px solid ${C.borderSoft}`,
            fontSize: 13, color: C.inkMuted,
          }}>
            Tip: click a day on the calendar first to pre-select the date.
          </div>
        )}

        {/* Explainer */}
        <div>
          <p style={{ fontFamily: FONT, fontSize: 13.5, fontWeight: 600, color: C.ink, margin: "0 0 6px" }}>
            How bookings work
          </p>
          <p style={{ fontFamily: FONT, fontSize: 12.5, color: C.inkMuted, lineHeight: 1.6, margin: 0 }}>
            Every booking starts as an inquiry — you propose talent + terms, the client approves, and the booking is confirmed. Once confirmed it shows up on the calendar.
          </p>
        </div>

        {/* Divider */}
        <div style={{ borderTop: `1px solid ${C.border}` }} />

        {/* CTAs */}
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <p style={{ fontFamily: FONT, fontSize: 11, fontWeight: 600, color: C.inkMuted, letterSpacing: 0.5, textTransform: "uppercase", margin: 0 }}>
            Start here
          </p>
          <Link
            href={`/${tenantSlug}/admin/messages`}
            onClick={onClose}
            style={{
              display: "flex", alignItems: "center", gap: 12,
              padding: "14px 16px", borderRadius: 10,
              background: C.cardBg, border: `1px solid ${C.borderSoft}`,
              textDecoration: "none", transition: "border-color 120ms",
            }}
          >
            <div style={{
              width: 36, height: 36, borderRadius: 9,
              background: "rgba(43,63,163,0.08)",
              display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
              fontSize: 17,
            }}>
              💬
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontFamily: FONT, fontSize: 13, fontWeight: 600, color: C.ink }}>Messages</div>
              <div style={{ fontFamily: FONT, fontSize: 12, color: C.inkMuted, marginTop: 2 }}>Start a conversation with a client — a booking thread is created automatically.</div>
            </div>
            <span style={{ color: C.inkMuted, fontSize: 14, flexShrink: 0 }}>→</span>
          </Link>
          <Link
            href={`/${tenantSlug}/admin/messages`}
            onClick={onClose}
            style={{
              display: "flex", alignItems: "center", gap: 12,
              padding: "14px 16px", borderRadius: 10,
              background: C.cardBg, border: `1px solid ${C.borderSoft}`,
              textDecoration: "none", transition: "border-color 120ms",
            }}
          >
            <div style={{
              width: 36, height: 36, borderRadius: 9,
              background: "rgba(15,79,62,0.08)",
              display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
              fontSize: 17,
            }}>
              📋
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontFamily: FONT, fontSize: 13, fontWeight: 600, color: C.ink }}>Open pipeline</div>
              <div style={{ fontFamily: FONT, fontSize: 12, color: C.inkMuted, marginTop: 2 }}>Pick an existing inquiry and confirm the event date to lock it onto the calendar.</div>
            </div>
            <span style={{ color: C.inkMuted, fontSize: 14, flexShrink: 0 }}>→</span>
          </Link>
          {preselectedDate && (
            <p style={{ fontFamily: FONT, fontSize: 11.5, color: C.inkMuted, margin: "4px 0 0", lineHeight: 1.5 }}>
              Once you set the event date in the inquiry to <strong style={{ color: C.ink }}>{displayDate}</strong>, it will appear on the calendar automatically.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

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
  const [activeTone, setActiveTone]     = useState<Tone | null>(null);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [newBookingOpen, setNewBookingOpen] = useState(false);

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

  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone.replaceAll("_", " ");
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

  // Status strip counts for this month (always from unfiltered month events)
  const allMonthEvents = Object.values(dayMap).flat();
  const confirmed  = allMonthEvents.filter((e) => e.tone === "green").length;
  const pending    = allMonthEvents.filter((e) => e.tone === "amber").length;
  const inProgress = allMonthEvents.filter((e) => e.tone === "ink").length;
  const expired    = allMonthEvents.filter((e) => e.tone === "red").length;

  // Apply tone filter to dayMap when active
  const filteredDayMap = activeTone
    ? Object.fromEntries(
        Object.entries(dayMap).map(([day, evts]) => [
          day,
          evts.filter((e) => e.tone === activeTone),
        ]).filter(([, evts]) => evts.length > 0),
      )
    : dayMap;

  const totalEvents = events.length;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, fontFamily: FONT }}>

      {/* ── Page header ── */}
      <div style={{
        display: "flex", alignItems: "flex-start",
        justifyContent: "space-between", gap: 12, flexWrap: "wrap",
        marginBottom: 4,
      }}>
        <div>
          <p style={{ fontFamily: FONT, fontSize: 11, fontWeight: 600, color: C.inkMuted, letterSpacing: 0.8, textTransform: "uppercase", marginBottom: 4 }}>
            Schedule
          </p>
          <h1 style={{
            fontFamily: FONT, fontSize: 26, fontWeight: 600, color: C.ink,
            letterSpacing: -0.4, lineHeight: 1.15, margin: 0,
          }}>
            Calendar
          </h1>
          <p style={{ fontFamily: FONT, fontSize: 12.5, color: C.inkMuted, marginTop: 4 }}>
            All bookings and inquiry dates in one view.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setNewBookingOpen(true)}
          style={{
            display: "inline-flex", alignItems: "center", height: 36,
            padding: "0 16px", borderRadius: 8, border: "none",
            background: C.accent, color: "#fff",
            fontFamily: FONT, fontSize: 13, fontWeight: 600, cursor: "pointer",
            letterSpacing: -0.1, flexShrink: 0,
          }}
        >
          + New booking
        </button>
      </div>

      {/* Status strip — click to filter calendar view */}
      <StatusStrip
        confirmed={confirmed}
        pending={pending}
        inProgress={inProgress}
        expired={expired}
        activeTone={activeTone}
        onFilter={setActiveTone}
      />
      {activeTone && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: C.inkMuted, fontFamily: FONT }}>
          <span>Showing {activeTone === "green" ? "confirmed" : activeTone === "amber" ? "submitted" : activeTone === "ink" ? "in-progress" : "expired"} events only.</span>
          <button
            type="button"
            onClick={() => setActiveTone(null)}
            style={{
              background: "none", border: "none", cursor: "pointer",
              fontSize: 12, color: C.accent, fontWeight: 600, padding: 0,
              fontFamily: FONT,
            }}
          >
            Clear filter
          </button>
        </div>
      )}

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
            gridAutoRows: "minmax(96px, auto)",
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
            const dayEvents = filteredDayMap[day] ?? [];
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
                isSelected={selectedDate === isoDate}
                onSelect={() => setSelectedDate(isoDate)}
              />
            );
          })}
        </div>
      </div>

      {/* Day detail panel */}
      {selectedDate && (
        <DayDetailPanel
          date={selectedDate}
          events={events}
          tenantSlug={tenantSlug}
          onClose={() => setSelectedDate(null)}
        />
      )}

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

      {/* ── New booking drawer ── */}
      <WorkspaceDrawer
        open={newBookingOpen}
        onClose={() => setNewBookingOpen(false)}
        width={440}
      >
        <NewBookingDrawer
          tenantSlug={tenantSlug}
          preselectedDate={selectedDate}
          onClose={() => setNewBookingOpen(false)}
        />
      </WorkspaceDrawer>
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
  isSelected,
  onSelect,
}: {
  day: number;
  ariaLabel: string;
  isToday: boolean;
  isoDate: string;
  dayEvents: { id: string; title: string; tone: Tone }[];
  colIndex: number;
  tenantSlug: string;
  isSelected: boolean;
  onSelect: () => void;
}) {
  const [hovered, setHovered] = useState(false);

  return (
    <div
      role="gridcell"
      aria-label={ariaLabel}
      aria-selected={isSelected}
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelect(); } }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        padding: "8px 10px",
        borderTop: `1px solid ${C.borderSoft}`,
        borderLeft: colIndex === 0 ? "none" : `1px solid ${C.borderSoft}`,
        display: "flex",
        flexDirection: "column",
        gap: 4,
        background: isSelected
          ? "rgba(15,79,62,0.04)"
          : hovered ? "rgba(11,11,13,0.025)" : "transparent",
        outline: isSelected ? `2px solid ${C.accent}` : "none",
        outlineOffset: -2,
        transition: "background 120ms",
        cursor: "pointer",
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
          alignSelf: "flex-start",
        }}
      >
        {day}
      </div>

      {/* Event chips (max 2 visible) */}
      {dayEvents.slice(0, 2).map((ev, idx) => {
        const { text, bg } = toneColor(ev.tone);
        return (
          <EventChip
            key={idx}
            title={ev.title}
            text={text}
            bg={bg}
            href={`/${tenantSlug}/admin/work/${ev.id}`}
          />
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

// ─── Day detail panel ─────────────────────────────────────────────────────────

const STATUS_LABEL: Record<string, { label: string; tone: Tone }> = {
  draft:             { label: "Draft",         tone: "ink" },
  submitted:         { label: "Submitted",     tone: "amber" },
  talent_suggested:  { label: "Talent added",  tone: "amber" },
  approved:          { label: "Approved",      tone: "amber" },
  offer_pending:     { label: "Offer pending", tone: "amber" },
  booked:            { label: "Booked",        tone: "green" },
  converted:         { label: "Confirmed",     tone: "green" },
  rejected:          { label: "Rejected",      tone: "red" },
  expired:           { label: "Expired",       tone: "red" },
  closed_lost:       { label: "Closed",        tone: "red" },
};

function DayDetailPanel({
  date,
  events,
  tenantSlug,
  onClose,
}: {
  date: string;
  events: CalendarEvent[];
  tenantSlug: string;
  onClose: () => void;
}) {
  const parts = date.split("-");
  const displayLabel = new Date(
    parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2])
  ).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });

  const dayEvents = events.filter((e) => e.event_date === date);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  return (
    <>
      {/* Backdrop */}
      <div
        aria-hidden
        onClick={onClose}
        style={{
          position: "fixed", inset: 0,
          background: "rgba(0,0,0,0.18)",
          zIndex: 40,
          animation: "fadeIn 120ms ease",
        }}
      />
      {/* Panel */}
      <div
        role="dialog"
        aria-label={displayLabel}
        aria-modal
        style={{
          position: "fixed", top: 0, right: 0, bottom: 0,
          width: "min(420px, 92vw)",
          background: "#fff",
          boxShadow: "-4px 0 32px rgba(0,0,0,0.12)",
          zIndex: 50,
          display: "flex", flexDirection: "column",
          fontFamily: FONT,
          animation: "slideInRight 180ms cubic-bezier(.4,0,.2,1)",
        }}
      >
        {/* Header */}
        <div style={{
          padding: "18px 20px 14px",
          borderBottom: `1px solid ${C.border}`,
          display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12,
        }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: C.ink, letterSpacing: -0.2 }}>
              {displayLabel}
            </div>
            <div style={{ fontSize: 12, color: C.inkMuted, marginTop: 3 }}>
              {dayEvents.length === 0
                ? "Nothing scheduled"
                : `${dayEvents.length} ${dayEvents.length === 1 ? "inquiry" : "inquiries"} scheduled`}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            style={{
              background: "transparent", border: "none", cursor: "pointer",
              color: C.inkMuted, padding: 4, borderRadius: 6,
              display: "flex", alignItems: "center", justifyContent: "center",
              flexShrink: 0,
            }}
          >
            <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: "auto", padding: "14px 16px", display: "flex", flexDirection: "column", gap: 8 }}>
          {dayEvents.length === 0 ? (
            <div style={{
              display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
              gap: 8, padding: "40px 0", textAlign: "center",
            }}>
              <svg width={32} height={32} viewBox="0 0 24 24" fill="none" stroke={C.inkDim} strokeWidth={1.4} strokeLinecap="round" strokeLinejoin="round">
                <rect x={3} y={4} width={18} height={18} rx={2} />
                <path d="M16 2v4M8 2v4M3 10h18" />
              </svg>
              <div style={{ fontSize: 13, color: C.inkMuted }}>Nothing scheduled for this day</div>
              <Link
                href={`/${tenantSlug}/admin/work`}
                style={{ fontSize: 12.5, color: C.accent, fontWeight: 600, textDecoration: "none" }}
              >
                Open work pipeline →
              </Link>
            </div>
          ) : (
            dayEvents.map((ev) => {
              const meta = STATUS_LABEL[ev.status] ?? { label: ev.status, tone: "ink" as Tone };
              const { text: badgeText, bg: badgeBg } = toneColor(meta.tone);
              const initials = (ev.contact_name || "?").slice(0, 2).toUpperCase();
              return (
                <Link
                  key={ev.id}
                  href={`/${tenantSlug}/admin/work/${ev.id}`}
                  onClick={onClose}
                  style={{
                    display: "flex", gap: 12, alignItems: "flex-start",
                    padding: "13px 14px",
                    background: "#fff",
                    border: `1px solid ${C.borderSoft}`,
                    borderRadius: 10,
                    textDecoration: "none",
                    transition: "border-color 120ms",
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.borderColor = C.border)}
                  onMouseLeave={(e) => (e.currentTarget.style.borderColor = C.borderSoft)}
                >
                  {/* Avatar */}
                  <div style={{
                    width: 36, height: 36, borderRadius: "50%",
                    background: C.accent + "22",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 13, fontWeight: 700, color: C.accent,
                    flexShrink: 0,
                  }}>
                    {initials}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap" }}>
                      <span style={{ fontSize: 13.5, fontWeight: 600, color: C.ink }}>
                        {ev.company ? `${ev.company}` : ev.contact_name}
                      </span>
                      <span style={{
                        fontSize: 10.5, fontWeight: 600,
                        padding: "1px 7px", borderRadius: 999,
                        background: badgeBg, color: badgeText,
                      }}>
                        {meta.label}
                      </span>
                    </div>
                    {ev.company && (
                      <div style={{ fontSize: 12, color: C.inkMuted, marginTop: 2 }}>
                        {ev.contact_name}
                      </div>
                    )}
                  </div>
                  <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke={C.inkDim} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: 2 }}>
                    <path d="M9 18l6-6-6-6" />
                  </svg>
                </Link>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div style={{
          padding: "12px 16px",
          borderTop: `1px solid ${C.border}`,
          display: "flex", gap: 8,
        }}>
          <Link
            href={`/${tenantSlug}/admin/work`}
            style={{
              flex: 1, textAlign: "center",
              padding: "8px 0",
              background: C.accent, color: "#fff",
              borderRadius: 8, fontSize: 13, fontWeight: 600,
              textDecoration: "none",
            }}
          >
            + New inquiry
          </Link>
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: "8px 16px",
              background: "transparent",
              border: `1px solid ${C.border}`,
              borderRadius: 8, fontSize: 13,
              color: C.inkMuted, cursor: "pointer",
              fontFamily: FONT,
            }}
          >
            Close
          </button>
        </div>
      </div>

      <style>{`
        @keyframes fadeIn { from { opacity: 0 } to { opacity: 1 } }
        @keyframes slideInRight { from { transform: translateX(100%) } to { transform: translateX(0) } }
      `}</style>
    </>
  );
}

// ─── Event chip ───────────────────────────────────────────────────────────────

function EventChip({
  title,
  text,
  bg,
  href,
}: {
  title: string;
  text: string;
  bg: string;
  href?: string;
}) {
  const style: React.CSSProperties = {
    display: "block",
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
    textDecoration: "none",
    cursor: "pointer",
  };

  if (href) {
    return (
      <Link href={href} style={style} title={title} onClick={(e) => e.stopPropagation()}>
        {title}
      </Link>
    );
  }
  return (
    <div style={style} title={title}>
      {title}
    </div>
  );
}
