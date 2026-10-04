/**
 * Pure helpers for the talent Calendar (mockup "Calendar · revised").
 * No React, no I/O: every function here is unit tested in calendar-view.test.ts.
 */
import { blocksTime, freeGaps } from "@/lib/talent-agenda/derive";
import type { TalentAgendaItem } from "@/lib/talent-agenda/types";

export type CalendarView = "week" | "day" | "month" | "list";

export type ListFilter = "all" | "requested" | "hold" | "confirmed" | "completed" | "cancelled";

export const LIST_FILTERS: readonly ListFilter[] = [
  "all",
  "requested",
  "hold",
  "confirmed",
  "completed",
  "cancelled",
];

function hhmm(date: Date): string {
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

export function timeRange(startsAt: string | Date, endsAt: string | Date): string {
  return `${hhmm(new Date(startsAt))}–${hhmm(new Date(endsAt))}`;
}

/** A booking-like record: not a personal block and not a deadline marker. */
export function isRecord(item: Pick<TalentAgendaItem, "kind">): boolean {
  return item.kind !== "block" && item.kind !== "deadline";
}

export function isRequest(item: Pick<TalentAgendaItem, "kind" | "booking">): boolean {
  return item.kind === "request" || item.booking === "requested";
}

export function isHold(item: Pick<TalentAgendaItem, "kind" | "booking">): boolean {
  return item.booking === "hold" || (item.kind === "hold" && item.booking !== "confirmed");
}

/**
 * Every state has a word and an icon, never colour alone.
 * Returns the icon plus an English copy key (translated by the caller).
 */
export function chipTag(
  item: Pick<TalentAgendaItem, "kind" | "booking" | "managedBy" | "holdUntil">,
): { icon: string; key: string; suffix?: string } {
  if (item.kind === "block") return { icon: "", key: "Blocked" };
  if (isRequest(item)) return { icon: "◌", key: "Request · not blocking" };
  if (item.booking === "completed") return { icon: "✓", key: "Completed" };
  if (item.booking === "cancelled") return { icon: "✕", key: "Cancelled" };
  if (item.booking === "no_show") return { icon: "✕", key: "No-show" };
  if (isHold(item)) {
    return {
      icon: "◷",
      key: item.holdUntil ? "On hold until" : "On hold",
      suffix: item.holdUntil ? hhmm(new Date(item.holdUntil)) : undefined,
    };
  }
  if (item.managedBy) return { icon: "✓", key: "agency job", suffix: item.managedBy.name };
  return { icon: "✓", key: "Confirmed" };
}

/**
 * A request does not block time, so a confirmed booking can land on top of it.
 * Returns the first time-blocking record it overlaps (accepting would double book).
 */
export function requestOverlap(
  request: Pick<TalentAgendaItem, "id" | "kind" | "booking" | "startsAt" | "endsAt">,
  items: readonly TalentAgendaItem[],
): TalentAgendaItem | null {
  if (!isRequest(request)) return null;
  const a = Date.parse(request.startsAt);
  const b = Date.parse(request.endsAt);
  if (Number.isNaN(a) || Number.isNaN(b)) return null;
  for (const item of items) {
    if (item.id === request.id || !blocksTime(item)) continue;
    const s = Date.parse(item.startsAt);
    const e = Date.parse(item.endsAt);
    if (a < e && b > s) return item;
  }
  return null;
}

/** Minutes booked (confirmed, held or completed records; requests and blocks excluded). */
export function daySummary(items: readonly TalentAgendaItem[]): { count: number; minutes: number } {
  let count = 0;
  let minutes = 0;
  for (const item of items) {
    if (!isRecord(item) || isRequest(item) || item.booking === "cancelled") continue;
    count += 1;
    if (!item.allDay) {
      minutes += Math.max(0, Math.round((Date.parse(item.endsAt) - Date.parse(item.startsAt)) / 60_000));
    }
  }
  return { count, minutes };
}

export function durationText(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h && m) return `${h} h ${m} min`;
  if (h) return `${h} h`;
  return `${m} min`;
}

export function matchesFilter(item: Pick<TalentAgendaItem, "kind" | "booking">, filter: ListFilter): boolean {
  if (!isRecord(item)) return false;
  switch (filter) {
    case "all":
      return true;
    case "requested":
      return isRequest(item);
    case "hold":
      return item.booking === "hold" || item.booking === "hold_expired";
    case "confirmed":
      return item.booking === "confirmed" && !isRequest(item);
    case "completed":
      return item.booking === "completed";
    case "cancelled":
      return item.booking === "cancelled" || item.booking === "no_show";
  }
}

export function filterCounts(items: readonly TalentAgendaItem[]): Record<ListFilter, number> {
  const out = { all: 0, requested: 0, hold: 0, confirmed: 0, completed: 0, cancelled: 0 };
  for (const item of items) {
    for (const f of LIST_FILTERS) if (matchesFilter(item, f)) out[f] += 1;
  }
  return out;
}

/** 42 Monday-first cells covering the month of `anchor`. */
export function monthCells(anchor: Date): Date[] {
  const first = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
  const lead = (first.getDay() + 6) % 7;
  return Array.from({ length: 42 }, (_, i) => new Date(first.getFullYear(), first.getMonth(), 1 - lead + i));
}

export function shiftMonth(date: Date, delta: number): Date {
  const day = date.getDate();
  const next = new Date(date.getFullYear(), date.getMonth() + delta, 1);
  const last = new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate();
  next.setDate(Math.min(day, last));
  return next;
}

/** How far the ‹ › arrows move for each view. */
export function stepDate(date: Date, view: CalendarView, dir: -1 | 1): Date {
  if (view === "month") return shiftMonth(date, dir);
  const next = new Date(date);
  next.setDate(next.getDate() + (view === "day" ? dir : dir * 7));
  return next;
}

/**
 * The next free slot after `from`, scanning up to `horizonDays` days, using the
 * same free-gap rule as the agenda (hours minus occupied, buffers, travel).
 */
export function nextFreeTime(
  from: Date,
  items: readonly TalentAgendaItem[],
  windowsFor: (day: Date) => { startMin: number; endMin: number }[],
  now: Date,
  horizonDays = 14,
): Date | null {
  for (let i = 0; i <= horizonDays; i += 1) {
    const day = new Date(from.getFullYear(), from.getMonth(), from.getDate() + i);
    const wins = windowsFor(day);
    if (!wins.length) continue;
    const dayItems = items.filter((item) => {
      const s = new Date(item.startsAt);
      return s.getFullYear() === day.getFullYear() && s.getMonth() === day.getMonth() && s.getDate() === day.getDate();
    });
    const gap = freeGaps(day, dayItems, { windows: wins }, now).find((g) => g.endsAt > now);
    if (gap) return gap.startsAt;
  }
  return null;
}

/** Dots for the phone week strip: solid = bookings, hollow = a request or hold. */
export function stripDots(items: readonly TalentAgendaItem[]): { solid: number; hollow: boolean } {
  let solid = 0;
  let hollow = false;
  for (const item of items) {
    if (!isRecord(item)) continue;
    if (isRequest(item) || isHold(item)) hollow = true;
    else if (item.booking !== "cancelled") solid += 1;
  }
  return { solid: Math.min(solid, 3), hollow };
}

/**
 * Side-by-side lanes for overlapping chips in one day column. Input spans are
 * the drawn pixel ranges (after min-height), so two short events that only
 * collide visually still get their own lane. Every chip in a cluster shares the
 * cluster's lane count, so widths line up.
 */
export function layoutLanes(
  spans: readonly { id: string; top: number; bottom: number }[],
): Map<string, { lane: number; lanes: number }> {
  const sorted = [...spans].sort((a, b) => a.top - b.top || b.bottom - a.bottom);
  const out = new Map<string, { lane: number; lanes: number }>();
  let cluster: { id: string; lane: number }[] = [];
  let laneEnds: number[] = [];
  let clusterEnd = -Infinity;
  const flush = () => {
    for (const c of cluster) out.set(c.id, { lane: c.lane, lanes: laneEnds.length });
    cluster = [];
    laneEnds = [];
  };
  for (const span of sorted) {
    if (span.top >= clusterEnd) {
      flush();
      clusterEnd = -Infinity;
    }
    let lane = laneEnds.findIndex((end) => end <= span.top);
    if (lane === -1) {
      lane = laneEnds.length;
      laneEnds.push(span.bottom);
    } else {
      laneEnds[lane] = span.bottom;
    }
    cluster.push({ id: span.id, lane });
    clusterEnd = Math.max(clusterEnd, span.bottom);
  }
  flush();
  return out;
}

/**
 * The service a record is for. Bookings made without a catalog item carry the
 * client's name as their title; that is not a service, so it returns null and
 * the caller shows an honest "No service set".
 */
export function serviceLabel(
  item: Pick<TalentAgendaItem, "title" | "lines" | "client" | "kind">,
): string | null {
  const client = item.client?.name?.trim().toLowerCase() ?? "";
  const candidates = [...item.lines.map((line) => line.label), item.title];
  for (const raw of candidates) {
    const label = raw?.trim();
    if (!label) continue;
    if (client && label.toLowerCase() === client) continue;
    return label;
  }
  return null;
}
