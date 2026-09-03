/**
 * rows.ts — turning database rows into the shapes the decision layer reads.
 *
 * SEPARATE FROM store.ts ON PURPOSE. `store.ts` imports "server-only", which
 * makes it unimportable from a test lane; this half has no Supabase import at
 * all, so every mapping decision below is actually covered rather than merely
 * believed. That split is a standing rule in this repo, not a preference.
 *
 * PURE. No DB.
 */

import type {
  IsoWeekday,
  ServiceWindow,
  ServiceWindowException,
} from "./types";

/** "HH:MM:SS" or "HH:MM" from Postgres `time`, as minutes past midnight. */
export function timeToMinutes(value: unknown): number | null {
  if (typeof value !== "string") return null;
  const m = /^(\d{2}):(\d{2})(?::\d{2})?$/.exec(value.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

/** Minutes past midnight back to "HH:MM:SS" for Postgres `time`. */
export function minutesToTime(minutes: number): string {
  const wrapped = ((Math.trunc(minutes) % 1440) + 1440) % 1440;
  const h = Math.floor(wrapped / 60);
  const m = wrapped % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00`;
}

function weekdaysOf(value: unknown): IsoWeekday[] {
  if (!Array.isArray(value)) return [];
  const out: IsoWeekday[] = [];
  for (const v of value) {
    const n = typeof v === "number" ? v : Number(v);
    if (Number.isInteger(n) && n >= 1 && n <= 7 && !out.includes(n as IsoWeekday)) {
      out.push(n as IsoWeekday);
    }
  }
  return out.sort((a, b) => a - b);
}

export function intOrNull(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isInteger(n) ? n : null;
}

export type WindowRow = Record<string, unknown>;

/**
 * A row becomes a window, or it becomes nothing.
 *
 * A row whose `local_time` or `weekdays` will not parse is DROPPED rather than
 * defaulted. A defaulted window is a service at a time nobody chose, which the
 * page would then offer to guests; an absent one is visibly missing from the
 * settings list, where an operator sees it.
 */
export function rowToWindow(row: WindowRow): ServiceWindow | null {
  const id = typeof row.id === "string" ? row.id : null;
  const venueId = typeof row.venue_id === "string" ? row.venue_id : null;
  const key = typeof row.key === "string" ? row.key : null;
  const localTimeMin = timeToMinutes(row.local_time);
  const durationMinutes = intOrNull(row.duration_minutes);
  const weekdays = weekdaysOf(row.weekdays);
  const startsOn = typeof row.starts_on === "string" ? row.starts_on : null;

  if (
    id === null ||
    venueId === null ||
    key === null ||
    localTimeMin === null ||
    durationMinutes === null ||
    durationMinutes < 15 ||
    weekdays.length === 0 ||
    startsOn === null
  ) {
    return null;
  }

  const step = intOrNull(row.seating_step_minutes);
  return {
    id,
    venueId,
    key,
    localTimeMin,
    durationMinutes,
    weekdays,
    lastSeatingOffsetMin: intOrNull(row.last_seating_offset_min),
    seatingStepMinutes: step !== null && step >= 5 ? step : 15,
    turnMinutesOverride: intOrNull(row.turn_minutes_override),
    startsOn,
    endsOn: typeof row.ends_on === "string" ? row.ends_on : null,
    isActive: row.is_active !== false,
  };
}

export function rowToException(row: WindowRow): ServiceWindowException | null {
  const venueId = typeof row.venue_id === "string" ? row.venue_id : null;
  const onDate = typeof row.on_date === "string" ? row.on_date : null;
  if (venueId === null || onDate === null) return null;
  return {
    venueId,
    windowId: typeof row.window_id === "string" ? row.window_id : null,
    onDate,
    isClosed: row.is_closed === true,
    localTimeMin: timeToMinutes(row.local_time),
    durationMinutes: intOrNull(row.duration_minutes),
    lastSeatingOffsetMin: intOrNull(row.last_seating_offset_min),
  };
}
