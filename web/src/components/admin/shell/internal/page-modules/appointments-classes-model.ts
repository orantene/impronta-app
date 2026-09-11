/**
 * appointments-classes-model.ts — the Sessions and Series tables as data.
 *
 * PURE. The Appointments & Classes page (boards W39 and W40) draws a grouped
 * table of dated sessions and a table of series; every row here is derived
 * from the schedule reader (`loadSchedule`) and the waitlist desk
 * (`loadSessionWaitlists`), never computed twice by the components. The
 * state pill vocabulary lives here so the table, the panel and the filter
 * agree on what "needs attention" means.
 *
 * THE VENUE'S CLOCK. A session's day is decided in its series' zone; a
 * one-off night carries no zone and is filed by the workspace's own (the
 * appointments board's `timeZone`), exactly as the old Schedule view did.
 */

import type { ScheduleNight, ScheduleOccurrence, ScheduleSeries } from "@/lib/sessions/schedule-actions";
import type { WaitlistView } from "@/lib/scheduling/waitlist-desk";
import { addUtcDays, utcToZonedYmd } from "@/lib/scheduling/tz";

/** The pill on a session row, in the board's words (keys under `state.*`). */
export type SessionRowState =
  | "scheduled"
  | "full"
  | "cancelled"
  | "completed"
  | "needsSeats"
  | "unknown";

export type SessionRow = {
  readonly id: string;
  readonly startsAt: string;
  readonly endsAt: string;
  readonly timeZone: string;
  /** YYYY-MM-DD on the venue's clock: the group the row sits under. */
  readonly ymd: string;
  readonly title: string;
  readonly seriesId: string | null;
  readonly seriesTitle: string | null;
  /** 1-based place among the series' dated sessions, and how many there are. */
  readonly seriesIndex: number | null;
  readonly seriesCount: number | null;
  readonly room: string | null;
  readonly seatsTotal: number | null;
  readonly seatsRemaining: number | null;
  readonly booked: number | null;
  readonly waiting: number;
  readonly state: SessionRowState;
  readonly poolKey: string | null;
  readonly poolCount: number;
};

export type SessionDayGroup = {
  readonly ymd: string;
  readonly rows: readonly SessionRow[];
};

export type SeriesRowState = "published" | "paused" | "needsAttention";

export type SeriesRow = {
  readonly id: string;
  readonly title: string;
  readonly weekdays: readonly number[];
  readonly localTime: string;
  readonly durationMinutes: number;
  readonly room: string | null;
  readonly seats: number;
  readonly timeZone: string | null;
  /** The last dated session the sweep has produced, or null with none. */
  readonly generatedThrough: string | null;
  readonly sessionCount: number;
  readonly state: SeriesRowState;
  readonly refusalReason: string | null;
  readonly collisions: number;
};

export function sessionState(occurrence: ScheduleOccurrence): SessionRowState {
  if (occurrence.status === "cancelled") return "cancelled";
  if (occurrence.status === "completed") return "completed";
  if (occurrence.status !== "scheduled") return "unknown";
  if (occurrence.seatsTotal === null) return "needsSeats";
  if (occurrence.seatsRemaining !== null && occurrence.seatsRemaining <= 0) return "full";
  return "scheduled";
}

/** What the "Needs attention" filter keeps: anything an operator must act on. */
export function needsAttention(state: SessionRowState): boolean {
  return state === "full" || state === "needsSeats" || state === "cancelled" || state === "unknown";
}

function waitingCount(view: WaitlistView | undefined): number {
  if (!view) return 0;
  return view.entries.filter((e) => e.state === "waiting" || e.state === "offered").length;
}

export function buildSessionRows(input: {
  series: readonly ScheduleSeries[];
  nights: readonly ScheduleNight[];
  waitlists: readonly WaitlistView[];
  /** The workspace's own zone, for a night with no series. */
  fallbackTimeZone: string;
}): SessionRow[] {
  const byId = new Map(input.waitlists.map((w) => [w.sessionId, w]));
  const rows: SessionRow[] = [];

  const push = (
    occurrence: ScheduleOccurrence,
    extra: {
      timeZone: string;
      title: string;
      seriesId: string | null;
      seriesTitle: string | null;
      seriesIndex: number | null;
      seriesCount: number | null;
      room: string | null;
    },
  ) => {
    const ymd = utcToZonedYmd(new Date(occurrence.startsAt), extra.timeZone) ?? occurrence.startsAt.slice(0, 10);
    const booked =
      occurrence.seatsTotal !== null && occurrence.seatsRemaining !== null
        ? Math.max(0, occurrence.seatsTotal - occurrence.seatsRemaining)
        : null;
    rows.push({
      id: occurrence.id,
      startsAt: occurrence.startsAt,
      endsAt: occurrence.endsAt,
      timeZone: extra.timeZone,
      ymd,
      title: extra.title,
      seriesId: extra.seriesId,
      seriesTitle: extra.seriesTitle,
      seriesIndex: extra.seriesIndex,
      seriesCount: extra.seriesCount,
      room: extra.room,
      seatsTotal: occurrence.seatsTotal,
      seatsRemaining: occurrence.seatsRemaining,
      booked,
      waiting: waitingCount(byId.get(occurrence.id)),
      state: sessionState(occurrence),
      poolKey: occurrence.poolKey,
      poolCount: occurrence.poolCount,
    });
  };

  for (const s of input.series) {
    const zone = s.timeZone ?? input.fallbackTimeZone;
    const sorted = [...s.occurrences].sort((a, b) => a.startsAt.localeCompare(b.startsAt));
    sorted.forEach((o, index) => {
      push(o, {
        timeZone: zone,
        title: s.title,
        seriesId: s.id,
        seriesTitle: s.title,
        seriesIndex: index + 1,
        seriesCount: sorted.length,
        room: o.venueName ?? s.venueName,
      });
    });
  }
  for (const n of input.nights) {
    push(n, {
      timeZone: input.fallbackTimeZone,
      title: n.title ?? "",
      seriesId: null,
      seriesTitle: null,
      seriesIndex: null,
      seriesCount: null,
      room: n.venueName,
    });
  }
  rows.sort((a, b) => a.startsAt.localeCompare(b.startsAt) || a.id.localeCompare(b.id));
  return rows;
}

export type SessionsView = "week" | "day" | "list";

/** The half-open [from, to) day window a view shows, as YYYY-MM-DD strings. */
export function viewWindow(view: SessionsView, anchorYmd: string): { from: string; to: string | null } {
  if (view === "list") return { from: anchorYmd, to: null };
  const days = view === "week" ? 7 : 1;
  return { from: anchorYmd, to: addUtcDays(anchorYmd, days) };
}

export function filterRows(
  rows: readonly SessionRow[],
  input: {
    view: SessionsView;
    anchorYmd: string;
    room: string | null;
    attentionOnly: boolean;
  },
): SessionRow[] {
  const window = viewWindow(input.view, input.anchorYmd);
  return rows.filter((row) => {
    if (row.ymd < window.from) return false;
    if (window.to !== null && row.ymd >= window.to) return false;
    if (input.room !== null && row.room !== input.room) return false;
    if (input.attentionOnly && !needsAttention(row.state)) return false;
    return true;
  });
}

export function groupByDay(rows: readonly SessionRow[]): SessionDayGroup[] {
  const groups = new Map<string, SessionRow[]>();
  for (const row of rows) {
    const list = groups.get(row.ymd) ?? [];
    list.push(row);
    groups.set(row.ymd, list);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([ymd, list]) => ({ ymd, rows: list }));
}

/** The rooms the rows mention, for the filter chip; never a table of its own. */
export function roomsOf(rows: readonly SessionRow[]): string[] {
  return [...new Set(rows.map((r) => r.room).filter((r): r is string => r !== null))].sort();
}

export function buildSeriesRows(series: readonly ScheduleSeries[]): SeriesRow[] {
  return series.map((s) => {
    const sorted = [...s.occurrences].sort((a, b) => a.startsAt.localeCompare(b.startsAt));
    const last = sorted.at(-1) ?? null;
    const state: SeriesRowState = !s.isActive
      ? "paused"
      : s.refusalReason !== null || s.skipped.length > 0
        ? "needsAttention"
        : "published";
    return {
      id: s.id,
      title: s.title,
      weekdays: s.weekdays,
      localTime: s.localTime,
      durationMinutes: s.durationMinutes,
      room: s.venueName,
      seats: s.seats,
      timeZone: s.timeZone,
      generatedThrough: last ? last.startsAt : null,
      sessionCount: sorted.length,
      state,
      refusalReason: s.refusalReason,
      collisions: s.skipped.length,
    };
  });
}

/** Everyone on any queue, for the Waitlist tab's count. */
export function waitlistCount(waitlists: readonly WaitlistView[]): number {
  return waitlists.reduce((n, w) => n + waitingCount(w), 0);
}
