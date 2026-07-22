"use client";

import { useMemo } from "react";
import { CapsLabel } from "../../primitives";
import { COLORS, FONTS, useAdminShell } from "../../state";
import type { TalentCalendarEntry } from "../../data-bridge";
import { parseMayDay } from "./calendar-2";

// Real "today" — module helper so the argless `new Date()` stays out of the
// component body (react-hooks/purity). Pinned once at mount via useMemo.
function calNow(): Date {
  return new Date();
}



// ════════════════════════════════════════════════════════════════════
// CALENDAR
// ════════════════════════════════════════════════════════════════════

/**
 * CalendarMonthGrid — month grid for the talent's calendar page,
 * showing confirmed bookings (green) and availability blocks (amber for
 * travel, neutral for personal). Hard-coded to May 2026 to match the
 * fixtures in `TALENT_BOOKINGS` + `AVAILABILITY_BLOCKS`.
 *
 * In production this becomes a real date-aware grid that paginates by
 * month and reads from the same data sources. For prototype purposes the
 * one-month view is enough to show the layout and visual language.
 */
export function CalendarMonthGrid({
  entries,
  onOpen,
}: {
  /** Real calendar entries (bridge mode). When provided, the grid renders the
   *  REAL current month from these instead of the May-2026 demo fixtures. */
  entries?: TalentCalendarEntry[];
  /** Click handler for a real booking/hold mark (routes to talent-hub-detail). */
  onOpen?: (entry: TalentCalendarEntry) => void;
} = {}) {
  const { openDrawer } = useAdminShell();
  const live = entries != null;

  type DayMark =
    | { kind: "booking"; id: string; label: string; client: string; entry?: TalentCalendarEntry }
    | { kind: "block"; id: string; label: string; type: "travel" | "personal" | "blocked"; entry?: TalentCalendarEntry }
    | { kind: "pending"; id: string; label: string; entry?: TalentCalendarEntry }
    | { kind: "inquiry"; id: string; label: string; entry?: TalentCalendarEntry };

  // Displayed month: the REAL current month in live mode, the fixed May-2026
  // demo month otherwise. `today` is pinned once at mount (calNow keeps the
  // argless new Date() out of the render body for react-hooks/purity).
  const today = useMemo(() => calNow(), []);
  const viewYear = today.getFullYear();
  const viewMonth = today.getMonth();
  const firstWeekday = live ? (new Date(viewYear, viewMonth, 1).getDay() + 6) % 7 : 4; // 0=Mon
  const daysInMonth = live ? new Date(viewYear, viewMonth + 1, 0).getDate() : 31;
  const monthLabel = live ? today.toLocaleString("en-US", { month: "long", year: "numeric" }) : "May 2026";

  const marksByDay = useMemo<Record<number, DayMark[]>>(() => {
    const byDay: Record<number, DayMark[]> = {};
    const addMark = (day: number, mark: DayMark) => {
      byDay[day] = byDay[day] ? [...byDay[day], mark] : [mark];
    };
    if (!live) {
      // Demo fixtures (standalone preview). bk1 = May 6, bk2 = May 14-15,
      // av1 = Apr 28 → May 2, av2 = May 22-26.
      addMark(1, { kind: "block", id: "av1", label: "Travel · Lisbon", type: "travel" });
      addMark(2, { kind: "block", id: "av1", label: "Travel · Lisbon", type: "travel" });
      addMark(6, { kind: "booking", id: "bk1", label: "08:30 · Mango", client: "Mango" });
      addMark(14, { kind: "booking", id: "bk2", label: "07:00 · Vogue", client: "Vogue Italia" });
      addMark(15, { kind: "booking", id: "bk2", label: "07:00 · Vogue", client: "Vogue Italia" });
      addMark(14, { kind: "pending", id: "rq5", label: "Hold · Stella McCartney" });
      for (let d = 18; d <= 20; d++) addMark(d, { kind: "pending", id: "rq2", label: "Hold · Bvlgari" });
      for (let d = 22; d <= 26; d++) addMark(d, { kind: "block", id: "av2", label: "Personal", type: "personal" });
      return byDay;
    }
    // Real entries → day cells of the current month. Multi-day spans paint
    // every covered day; a half-open [start, end) midnight end doesn't bleed
    // into the following day.
    for (const e of entries!) {
      const start = new Date(e.startsAt);
      const end = new Date(e.endsAt);
      if (isNaN(start.getTime()) || isNaN(end.getTime())) continue;
      const cursor = new Date(start.getFullYear(), start.getMonth(), start.getDate());
      const lastInclusive = new Date(end.getFullYear(), end.getMonth(), end.getDate());
      const endsAtMidnight = end.getHours() === 0 && end.getMinutes() === 0 && end.getSeconds() === 0;
      if (endsAtMidnight && lastInclusive.getTime() > cursor.getTime()) lastInclusive.setDate(lastInclusive.getDate() - 1);
      const label = e.title || e.subLabel || (e.kind === "block" ? "Unavailable" : "Booking");
      const travel = /travel|flight|trip|tour/iu.test(`${e.title} ${e.subLabel ?? ""}`);
      let guard = 0;
      while (cursor.getTime() <= lastInclusive.getTime() && guard < 400) {
        guard++;
        if (cursor.getFullYear() === viewYear && cursor.getMonth() === viewMonth) {
          const day = cursor.getDate();
          if (e.kind === "booking") addMark(day, { kind: "booking", id: e.inquiryId ?? e.id, label, client: e.subLabel ?? label, entry: e });
          else if (e.kind === "hold") addMark(day, { kind: "pending", id: e.inquiryId ?? e.id, label, entry: e });
          else addMark(day, { kind: "block", id: e.id, label, type: travel ? "travel" : "personal", entry: e });
        }
        cursor.setDate(cursor.getDate() + 1);
      }
    }
    return byDay;
  }, [live, entries, viewYear, viewMonth]);

  const totalCells = Math.ceil((firstWeekday + daysInMonth) / 7) * 7;
  const weekdayLabels = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

  return (
    <section className="mb-6">
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
        <CapsLabel>{monthLabel}</CapsLabel>
        <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
          <CalendarLegendDot tone="green" label="Booked" />
          <CalendarLegendDot tone="coral" label="Pending" />
          <CalendarLegendDot tone="indigo" label="Inquiry" />
          <CalendarLegendDot tone="amber" label="Travel" />
          <CalendarLegendDot tone="dim" label="Personal" />
        </div>
      </div>

      <div
        style={{
          background: "#fff",
          border: `1px solid ${COLORS.borderSoft}`,
          borderRadius: 12,
          overflow: "hidden",
        }}
      >
        {/* Weekday header */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(7, 1fr)",
            background: "rgba(11,11,13,0.02)",
            borderBottom: `1px solid ${COLORS.borderSoft}`,
          }}
        >
          {weekdayLabels.map((d) => (
            <div
              key={d}
              style={{
                padding: "10px 12px",
                fontFamily: FONTS.body,
                fontSize: 11,
                fontWeight: 600,
                letterSpacing: 1,
                textTransform: "uppercase",
                color: COLORS.inkMuted,
              }}
            >
              {d}
            </div>
          ))}
        </div>

        {/* Day cells */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(7, 1fr)",
            gridAutoRows: "minmax(86px, auto)",
          }}
        >
          {Array.from({ length: totalCells }).map((_, idx) => {
            const dayNum = idx - firstWeekday + 1;
            const inMonth = dayNum >= 1 && dayNum <= daysInMonth;
            const marks = inMonth ? marksByDay[dayNum] ?? [] : [];
            const isWeekend = idx % 7 >= 5;
            const colCount = idx % 7;
            const rowEnd = idx >= totalCells - 7;

            return (
              <div
                key={idx}
                style={{
                  borderRight: colCount === 6 ? "none" : `1px solid ${COLORS.borderSoft}`,
                  borderBottom: rowEnd ? "none" : `1px solid ${COLORS.borderSoft}`,
                  background: inMonth ? "#fff" : "rgba(11,11,13,0.02)",
                  padding: "8px 10px",
                  display: "flex",
                  flexDirection: "column",
                  gap: 6,
                  minHeight: 86,
                }}
              >
                {inMonth && (
                  <div
                    style={{
                      fontFamily: FONTS.body,
                      fontSize: 12,
                      fontWeight: 500,
                      color: isWeekend ? COLORS.inkMuted : COLORS.ink,
                    }}
                  >
                    {dayNum}
                  </div>
                )}
                <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                  {marks.map((mark, mi) => {
                    // A7: tone palette per mark kind
                    let bg = "rgba(11,11,13,0.05)";
                    let fg = COLORS.inkMuted;
                    let pattern: string | undefined;
                    if (mark.kind === "booking") {
                      bg = COLORS.successSoft;
                      fg = COLORS.successDeep;
                    } else if (mark.kind === "pending") {
                      // Hold/pending now uses a diagonal-stripe overlay so it
                      // visually reads "soft commitment, not booked yet" at
                      // a glance — distinct from solid confirmed bookings.
                      bg = COLORS.coralSoft;
                      fg = COLORS.coralDeep;
                      pattern = `repeating-linear-gradient(135deg, ${COLORS.coralSoft} 0, ${COLORS.coralSoft} 4px, rgba(194,106,69,0.18) 4px, rgba(194,106,69,0.18) 6px)`;
                    } else if (mark.kind === "inquiry") {
                      bg = COLORS.indigoSoft;
                      fg = COLORS.indigoDeep;
                    } else if (mark.kind === "block" && mark.type === "travel") {
                      bg = "rgba(82,96,109,0.12)";
                      fg = COLORS.amberDeep;
                    }
                    return (
                    <button
                      key={`${idx}-${mi}`}
                      onClick={() => {
                        // Live mode: route real bookings/holds to the same
                        // detail surface the week/day/list views use.
                        if (mark.entry && onOpen && (mark.kind === "booking" || mark.kind === "pending")) {
                          onOpen(mark.entry);
                        } else if (mark.kind === "booking") {
                          openDrawer("talent-booking-detail", { id: mark.id });
                        } else if (mark.kind === "pending") {
                          openDrawer("talent-offer-detail", { id: mark.id });
                        } else if (mark.kind === "inquiry") {
                          openDrawer("inquiry-workspace", { inquiryId: mark.id, pov: "talent" });
                        } else {
                          openDrawer("talent-availability", { id: mark.id });
                        }
                      }}
                      style={{
                        background: pattern ?? bg,
                        color: fg,
                        border: mark.kind === "pending" ? "1px dashed rgba(194,106,69,0.45)" : "none",
                        borderRadius: 5,
                        padding: "3px 6px",
                        cursor: "pointer",
                        textAlign: "left",
                        fontFamily: FONTS.body,
                        fontSize: 10.5,
                        fontWeight: 500,
                        lineHeight: 1.25,
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        opacity: mark.kind === "inquiry" ? 0.85 : 1,
                      }}
                      title={mark.kind === "pending" ? `${mark.label} (pending hold — not yet confirmed)` : mark.label}
                    >
                      {mark.label}
                    </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}


function CalendarLegendDot({ tone, label }: { tone: "green" | "amber" | "dim" | "coral" | "indigo"; label: string }) {
  const c =
    tone === "green"
      ? COLORS.green
      : tone === "amber"
        ? COLORS.amber
        : tone === "coral"
          ? COLORS.coral
          : tone === "indigo"
            ? COLORS.indigo
            : COLORS.inkMuted;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontFamily: FONTS.body, fontSize: 11 }} className="text-admin-ink-muted">
      <span
        style={{
          width: 7,
          height: 7,
          borderRadius: "50%",
          background: c,
          display: "inline-block",
        }}
      />
      {label}
    </span>
  );
}


// ─── Calendar week + day views (F7) ──────────────────────────────
//
// Both views consume the same CalendarEvent[] used by the list. Week
// groups by start day across a 7-day strip; Day shows a single day's
// events bucketed by morning/afternoon/evening. Both are list-style —
// no time-grid column — because the prototype's data is day-granular,
// not hour-granular.

/**
 * Audit #34 — calendar color legend. Surfaces the meaning of the
 * left-border tones used by Week + Day views (and the conflict banner)
 * so the user doesn't have to memorize the system.
 */
function CalendarColorLegend() {
  const items: { tone: string; label: string }[] = [
    { tone: COLORS.green, label: "Booked" },
    { tone: COLORS.coral, label: "Pending / hold" },
    { tone: COLORS.indigo, label: "Inquiry" },
    { tone: COLORS.inkDim, label: "Past" },
  ];
  return (
    <div
      role="img"
      aria-label="Event status legend"
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 10,
        fontFamily: FONTS.body,
        fontSize: 10.5,
        color: COLORS.inkMuted,
      }}
    >
      {items.map((it) => (
        <span key={it.label} style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
          <span
            aria-hidden
            style={{
              width: 8,
              height: 8,
              borderRadius: 2,
              background: it.tone,
            }}
          />
          {it.label}
        </span>
      ))}
    </div>
  );
}


export function CalendarWeekView({
  events,
  onOpen,
  year,
  month,
}: {
  events: { id: string; kind: string; client: string; brief: string; dateLabel: string; status: string; startDay: number | null; drawer: { id: import("../../state").DrawerId; payload: Record<string, unknown> } }[];
  onOpen: (d: { id: import("../../state").DrawerId; payload: Record<string, unknown> }) => void;
  /** The page's selected calendar year/month (1-based month) — the same pair
   *  the events' `startDay` values were parsed against. */
  year: number;
  month: number;
}) {
  // Anchor on a REAL week (Mon–Sun): the week containing today when the
  // selected month is the current one, else the week containing the 1st of
  // the selected month. Was hardcoded to "May 12–18, 2026" (a prototype-era
  // mock anchor), which contradicted the page's month header.
  const now = new Date();
  const inCurrentMonth = now.getFullYear() === year && now.getMonth() + 1 === month;
  const anchor = inCurrentMonth ? now : new Date(year, month - 1, 1);
  const mondayOffset = (anchor.getDay() + 6) % 7; // 0 = Monday
  const weekDates = Array.from({ length: 7 }, (_, i) =>
    new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate() - mondayOffset + i),
  );
  // `startDay` is a day-of-month within (year, month) — only match a week
  // slot when that slot actually falls inside the selected month.
  const dayNumberFor = (d: Date): number | null =>
    d.getFullYear() === year && d.getMonth() === month - 1 ? d.getDate() : null;
  const fmtShort = (d: Date) => d.toLocaleString("en-US", { month: "short", day: "numeric" });
  const weekLabel = `Week of ${fmtShort(weekDates[0]!)} — ${fmtShort(weekDates[6]!)}, ${weekDates[6]!.getFullYear()}`;
  const visibleCount = events.filter((e) => {
    if (e.startDay === null) return false;
    return weekDates.some((d) => dayNumberFor(d) === e.startDay);
  }).length;
  return (
    <section
      style={{
        background: "#fff",
        border: `1px solid ${COLORS.borderSoft}`,
        borderRadius: 12,
        overflow: "hidden",
      }}
    >
      <div
        style={{
          padding: "10px 14px",
          borderBottom: `1px solid ${COLORS.borderSoft}`,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          fontFamily: FONTS.body,
        }}
      >
        <div className="flex items-center gap-3.5">
          <CapsLabel>{weekLabel}</CapsLabel>
          {/* Audit #34 — color legend so the left-border tones are scannable */}
          <CalendarColorLegend />
        </div>
        <span className="text-admin-ink-muted text-admin-11h">
          {visibleCount} events
        </span>
      </div>
      {weekDates.map((date, i) => {
        const dayNumber = dayNumberFor(date);
        const dayEvents = dayNumber === null ? [] : events.filter((e) => e.startDay === dayNumber);
        const dayName = date.toLocaleString("en-US", { weekday: "short" });
        return (
          <div
            key={date.toISOString()}
            style={{
              display: "flex",
              gap: 12,
              padding: "10px 14px",
              borderTop: i === 0 ? "none" : `1px solid ${COLORS.borderSoft}`,
              background: dayEvents.length > 0 ? "#fff" : "rgba(11,11,13,0.015)",
              fontFamily: FONTS.body,
            }}
          >
            <div style={{ width: 60, flexShrink: 0 }}>
              <div style={{ fontSize: 18, fontWeight: 500, fontFamily: FONTS.display, letterSpacing: -0.2 }} className="text-admin-ink">
                {date.getDate()}
              </div>
              <div style={{ fontSize: 10.5, textTransform: "uppercase", letterSpacing: 0.7 }} className="text-admin-ink-muted">
                {dayName}
              </div>
            </div>
            <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 6 }}>
              {dayEvents.length === 0 ? (
                <div style={{ fontSize: 11.5, paddingTop: 4 }} className="text-admin-ink-dim">—</div>
              ) : (
                dayEvents.map((e) => (
                  <button
                    key={e.id}
                    type="button"
                    onClick={() => onOpen(e.drawer)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      padding: "8px 10px",
                      background: "rgba(11,11,13,0.03)",
                      border: "none",
                      borderLeft: `3px solid ${
                        e.kind === "booked" ? COLORS.green :
                        e.kind === "pending" ? COLORS.coral :
                        e.kind === "inquiry" ? COLORS.indigo :
                        e.kind === "cancelled" ? COLORS.coral :
                        COLORS.inkDim
                      }`,
                      borderRadius: 6,
                      cursor: "pointer",
                      textAlign: "left",
                      fontFamily: FONTS.body,
                    }}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="text-admin-ink text-admin-12h font-medium">
                        {e.client} · {e.brief}
                      </div>
                      <div style={{ fontSize: 11, marginTop: 1 }} className="text-admin-ink-muted">
                        {e.status}
                      </div>
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>
        );
      })}
    </section>
  );
}


export function CalendarDayView({
  events,
  onOpen,
}: {
  events: { id: string; kind: string; client: string; brief: string; dateLabel: string; status: string; amount?: string; startDay: number | null; drawer: { id: import("../../state").DrawerId; payload: Record<string, unknown> } }[];
  onOpen: (d: { id: import("../../state").DrawerId; payload: Record<string, unknown> }) => void;
}) {
  // Anchor on May 14 — the prototype's hot day with the conflict.
  const targetDay = 14;
  const dayEvents = events.filter((e) => e.startDay === targetDay);
  // Bucket assignment is mock — production reads time-of-day from event records.
  const bucketed = {
    morning: dayEvents.slice(0, Math.ceil(dayEvents.length / 3)),
    afternoon: dayEvents.slice(Math.ceil(dayEvents.length / 3), Math.ceil((dayEvents.length * 2) / 3)),
    evening: dayEvents.slice(Math.ceil((dayEvents.length * 2) / 3)),
  };
  return (
    <section
      style={{
        background: "#fff",
        border: `1px solid ${COLORS.borderSoft}`,
        borderRadius: 12,
        overflow: "hidden",
        fontFamily: FONTS.body,
      }}
    >
      <div
        style={{
          padding: "12px 16px",
          borderBottom: `1px solid ${COLORS.borderSoft}`,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <div>
          <div style={{ fontFamily: FONTS.display, fontSize: 22, fontWeight: 500, letterSpacing: -0.3 }} className="text-admin-ink">
            Thursday, May {targetDay}
          </div>
          <div style={{ fontSize: 11.5, marginTop: 2 }} className="text-admin-ink-muted">
            {dayEvents.length} events
          </div>
        </div>
      </div>
      {(["morning", "afternoon", "evening"] as const).map((bucket) => (
        <div
          key={bucket}
          style={{
            display: "flex",
            gap: 12,
            padding: "12px 16px",
            borderTop: bucket === "morning" ? "none" : `1px solid ${COLORS.borderSoft}`,
          }}
        >
          <div style={{ width: 90, flexShrink: 0 }}>
            <CapsLabel>{bucket}</CapsLabel>
            <div style={{ fontSize: 11, marginTop: 2 }} className="text-admin-ink-dim">
              {bucket === "morning" ? "Before 12" : bucket === "afternoon" ? "12 — 6pm" : "After 6pm"}
            </div>
          </div>
          <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 6 }}>
            {bucketed[bucket].length === 0 ? (
              <div style={{ fontSize: 11.5, paddingTop: 4 }} className="text-admin-ink-dim">Free</div>
            ) : (
              bucketed[bucket].map((e) => (
                <button
                  key={e.id}
                  type="button"
                  onClick={() => onOpen(e.drawer)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    padding: "10px 12px",
                    background: "#fff",
                    border: `1px solid ${COLORS.borderSoft}`,
                    borderLeft: `3px solid ${
                      e.kind === "booked" ? COLORS.green :
                      e.kind === "pending" ? COLORS.coral :
                      e.kind === "inquiry" ? COLORS.indigo :
                      COLORS.inkDim
                    }`,
                    borderRadius: 8,
                    cursor: "pointer",
                    textAlign: "left",
                  }}
                >
                  <div className="flex-1 min-w-0">
                    <div className="text-admin-ink text-admin-13 font-medium">
                      {e.client}
                    </div>
                    <div style={{ fontSize: 11.5, marginTop: 1 }} className="text-admin-ink-muted">
                      {e.brief} · {e.status}
                    </div>
                  </div>
                  {e.amount && (
                    <span className="text-admin-green text-xs font-semibold">
                      {e.amount}
                    </span>
                  )}
                </button>
              ))
            )}
          </div>
        </div>
      ))}
    </section>
  );
}


// ─── Calendar event model ─────────────────────────────────────────
//
// The calendar shows four kinds of events, all represented uniformly so
// filter chips can slice them and conflict detection can compare dates.
//
//   booked    — confirmed booking. Sage tone. The default view.
//   pending   — hold or offer awaiting reply. Coral tone (your move).
//   inquiry   — in-flight inquiry the talent is being considered for. Indigo.
//   past      — wrapped/paid bookings. Ink-dim.

export type CalendarEventKind = "booked" | "pending" | "inquiry" | "past" | "cancelled";


export type CalendarEvent = {
  id: string;
  kind: CalendarEventKind;
  client: string;
  brief: string;
  /** Numeric start day of May 2026 (1–31). null = no date set. */
  startDay: number | null;
  /** End day of May 2026; same as start for single-day events. */
  endDay: number | null;
  /** Display range "May 14" or "May 14–15". */
  dateLabel: string;
  amount?: string;
  /** Status microcopy — what's the current state of this event. */
  status: string;
  /** Click target: drawer ID + payload. */
  drawer: { id: import("../../state").DrawerId; payload: Record<string, unknown> };
};


// Parse an ISO date string into a day-of-month number for a given year+month.
// Falls back to the human-readable parser (May 14) for prototype mock strings.
function parseDateToMayDay(s: string | null | undefined, endOfRange = false): number | null {
  return parseDateForCalMonth(s, 2026, 5, endOfRange);
}

export function parseDateForCalMonth(
  s: string | null | undefined,
  year: number,
  month: number,
  endOfRange = false,
): number | null {
  if (!s) return null;
  const isoMatch = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) {
    const [, yr, mo, dy] = isoMatch;
    if (parseInt(yr!) === year && parseInt(mo!) === month) return parseInt(dy!, 10);
    return null;
  }
  return parseMayDay(s, endOfRange);
}
