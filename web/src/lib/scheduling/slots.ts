/**
 * generateSlots — compute free appointment starts from hours − padded busy.
 *
 * PURE. Slots are never stored. durationMinutes is load-bearing (default 60).
 * Grid step comes from hours.slotMinutes (default 30). A slot fits only when
 * [start - bufferBefore, end + bufferAfter) stays inside a local window and
 * does not overlap any busy interval.
 */

import {
  type BookingHours,
  type LocalWindow,
  windowsForDate,
} from "./hours-types";
import {
  addUtcDays,
  utcToZonedYmd,
  weekdayUtc,
  zonedLocalToUtc,
} from "./tz";

export type BusyInterval = {
  startsAt: Date;
  endsAt: Date;
};

export type GeneratedSlot = {
  startsAt: Date;
  endsAt: Date;
};

export type GenerateSlotsInput = {
  hours: BookingHours;
  /** Offering length. Null/garbage → 60. */
  durationMinutes?: number | null;
  from: Date;
  busy?: readonly BusyInterval[];
};

function overlaps(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return aStart < bEnd && bStart < aEnd;
}

function paddedBusy(busy: readonly BusyInterval[], beforeMs: number, afterMs: number): Array<[number, number]> {
  return busy
    .map((b) => [b.startsAt.getTime() - beforeMs, b.endsAt.getTime() + afterMs] as [number, number])
    .filter(([s, e]) => Number.isFinite(s) && Number.isFinite(e) && e > s);
}

function durationOrDefault(v: number | null | undefined): number {
  if (typeof v !== "number" || !Number.isFinite(v) || v <= 0 || v > 480) return 60;
  return Math.trunc(v);
}

function slotFitsWindow(startMin: number, duration: number, window: LocalWindow): boolean {
  return startMin >= window.startMin && startMin + duration <= window.endMin;
}

export function generateSlots(input: GenerateSlotsInput): GeneratedSlot[] {
  const { hours, from } = input;
  if (Number.isNaN(from.getTime())) return [];

  const duration = durationOrDefault(input.durationMinutes);
  const step = hours.slotMinutes;
  const horizon = hours.horizonDays;
  const noticeMs = hours.minNoticeMin * 60_000;
  const earliestStart = from.getTime() + noticeMs;
  const beforeMs = hours.bufferBeforeMin * 60_000;
  const afterMs = hours.bufferAfterMin * 60_000;
  const busy = paddedBusy(input.busy ?? [], beforeMs, afterMs);

  const startYmd = utcToZonedYmd(from, hours.timezone);
  if (!startYmd) return [];

  const out: GeneratedSlot[] = [];
  for (let day = 0; day < horizon; day += 1) {
    const ymd = addUtcDays(startYmd, day);
    if (!ymd) break;
    const weekday = weekdayUtc(ymd);
    if (weekday == null) continue;
    const windows = windowsForDate(hours, ymd, weekday as 0 | 1 | 2 | 3 | 4 | 5 | 6);
    for (const window of windows) {
      for (let startMin = window.startMin; startMin + duration <= window.endMin; startMin += step) {
        if (!slotFitsWindow(startMin, duration, window)) continue;
        const startsAt = zonedLocalToUtc(ymd, startMin, hours.timezone);
        if (!startsAt) continue; // DST gap
        const endsAt = new Date(startsAt.getTime() + duration * 60_000);
        if (startsAt.getTime() < earliestStart) continue;
        const occupied = busy.some(([bStart, bEnd]) =>
          overlaps(startsAt.getTime(), endsAt.getTime(), bStart, bEnd),
        );
        if (occupied) continue;
        out.push({ startsAt, endsAt });
      }
    }
  }
  return out;
}
