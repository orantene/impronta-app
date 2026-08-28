/**
 * Public slot projection — free starts only, never busy rows.
 *
 * PURE. The route loads hours + busy, then this clamps the requested window
 * to hours.horizonDays and returns ISO starts. durationMinutes is
 * load-bearing (default 60 via generateSlots).
 */

import { generateSlots, type BusyInterval } from "./slots";
import type { BookingHours } from "./hours-types";

export const PUBLIC_SLOTS_DEFAULT_DAYS = 7;
export const PUBLIC_SLOTS_MAX_DAYS = 60;

export function clampPublicSlotDays(raw: unknown): number {
  const n = typeof raw === "number" ? raw : typeof raw === "string" ? Number.parseInt(raw, 10) : NaN;
  if (!Number.isFinite(n)) return PUBLIC_SLOTS_DEFAULT_DAYS;
  return Math.min(Math.max(Math.trunc(n), 1), PUBLIC_SLOTS_MAX_DAYS);
}

const YMD_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Parse ?from=YYYY-MM-DD or an ISO instant. Missing / garbage → now. */
export function parsePublicSlotFrom(raw: string | null | undefined, now: Date = new Date()): Date {
  if (raw == null || raw.trim() === "") return now;
  const trimmed = raw.trim();
  const ymd = YMD_RE.exec(trimmed);
  if (ymd) {
    const utc = new Date(Date.UTC(Number(ymd[1]), Number(ymd[2]) - 1, Number(ymd[3])));
    return Number.isNaN(utc.getTime()) ? now : utc;
  }
  const instant = new Date(trimmed);
  return Number.isNaN(instant.getTime()) ? now : instant;
}

export function computePublicSlotStarts(input: {
  hours: BookingHours | null;
  durationMinutes: number;
  from: Date;
  days: number;
  busy?: readonly BusyInterval[];
}): string[] {
  if (!input.hours) return [];
  const days = clampPublicSlotDays(input.days);
  const horizon = Math.min(days, input.hours.horizonDays);
  const hours = { ...input.hours, horizonDays: horizon };
  return generateSlots({
    hours,
    durationMinutes: input.durationMinutes,
    from: input.from,
    busy: input.busy,
  }).map((s) => s.startsAt.toISOString());
}
