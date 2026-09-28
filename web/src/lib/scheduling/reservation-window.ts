/**
 * reservation-window.ts — server re-check of a client-sent booking window.
 * PURE, no I/O.
 *
 * The public sheet sends `{ startsAt, endsAt }`. Before this, the server only
 * checked notice (`too_soon`), so a hand-edited POST could hold a 10-minute
 * window for a 90-minute service, a start two years out, or 03:00 on a day the
 * talent is closed. Each rule here is the SAME rule the slot generator applies
 * (`generateSlots`): the same duration sum the sheet uses, the same horizon
 * day count from the talent's local today, and the same "start and end fit
 * inside one local window" test. A slot the page offers always passes.
 */

import { windowsForDate, type BookingHours, type WeekdayIndex } from "./hours-types";
import { utcToZonedHmm, utcToZonedYmd, weekdayUtc, zonedLocalToUtc } from "./tz";

export type ReservationWindowRefusal = "bad_duration" | "beyond_horizon" | "outside_hours";

export type ReservationWindowGate =
  | { ok: true }
  | { ok: false; reason: ReservationWindowRefusal; error: string };

/**
 * Base offering minutes + selected extras that carry duration. A missing base
 * counts as 60, which is what the sheet and `generateSlots` both assume.
 * `catalogBookingDurationMinutes` (the sheet) delegates here.
 */
export function bookingDurationMinutes(
  baseMinutes: number | null | undefined,
  addOns: readonly { id: string; durationMinutes?: number | null }[],
  selectedIds: readonly string[],
): number {
  const base = typeof baseMinutes === "number" && baseMinutes > 0 ? baseMinutes : 60;
  let extras = 0;
  for (const a of addOns) {
    if (!selectedIds.includes(a.id)) continue;
    if (typeof a.durationMinutes === "number" && a.durationMinutes > 0) {
      extras += a.durationMinutes;
    }
  }
  return base + extras;
}

function ymdDayIndex(ymd: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
  if (!m) return null;
  return Math.round(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) / 86_400_000);
}

function hmmToMin(hmm: string | null): number | null {
  if (!hmm) return null;
  const m = /^(\d{2}):(\d{2})$/.exec(hmm);
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

/**
 * Validate a client window against the server's own numbers.
 *
 * `hours` null means the talent has no hours row: there is no slot engine to
 * agree with, so only the duration is checked (the no-hours path is decided
 * upstream by `timedInstantMissingSlot`).
 */
export function validateReservationWindow(input: {
  startsAt: string;
  endsAt: string;
  expectedDurationMin: number;
  hours: BookingHours | null;
  now?: Date;
}): ReservationWindowGate {
  const startMs = Date.parse(input.startsAt);
  const endMs = Date.parse(input.endsAt);
  if (
    !Number.isFinite(startMs) ||
    !Number.isFinite(endMs) ||
    endMs - startMs !== input.expectedDurationMin * 60_000
  ) {
    return {
      ok: false,
      reason: "bad_duration",
      error: "That time no longer matches this booking. Pick a time again.",
    };
  }

  const hours = input.hours;
  if (!hours) return { ok: true };

  const now = input.now ?? new Date();
  const start = new Date(startMs);
  const todayYmd = utcToZonedYmd(now, hours.timezone);
  const startYmd = utcToZonedYmd(start, hours.timezone);
  const todayIdx = todayYmd ? ymdDayIndex(todayYmd) : null;
  const startIdx = startYmd ? ymdDayIndex(startYmd) : null;
  if (!startYmd || todayIdx == null || startIdx == null) {
    return { ok: false, reason: "outside_hours", error: "That time is not available. Pick another start." };
  }
  // generateSlots walks day 0 .. horizonDays - 1 from the local today.
  if (startIdx - todayIdx >= hours.horizonDays) {
    return {
      ok: false,
      reason: "beyond_horizon",
      error: "That date is too far ahead. Pick an earlier date.",
    };
  }

  const weekday = weekdayUtc(startYmd);
  const startMin = hmmToMin(utcToZonedHmm(start, hours.timezone));
  const fits =
    weekday != null &&
    startMin != null &&
    windowsForDate(hours, startYmd, weekday as WeekdayIndex).some(
      (w) => startMin >= w.startMin && startMin + input.expectedDurationMin <= w.endMin,
    ) &&
    // Round-trip, as generateSlots builds its instants: a wall clock in a DST
    // gap or a start not on a whole minute is not an offered slot.
    zonedLocalToUtc(startYmd, startMin, hours.timezone)?.getTime() === startMs;
  if (!fits) {
    return {
      ok: false,
      reason: "outside_hours",
      error: "That time is outside open hours. Pick another start.",
    };
  }
  return { ok: true };
}
