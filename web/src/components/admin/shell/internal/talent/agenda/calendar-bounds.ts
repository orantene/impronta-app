/**
 * Pure hour-range math for the talent Calendar grid (TUL-667).
 *
 * ONE source for the visible hours: the talent's booking hours (default only
 * when no day in view has a working window). The hour rail labels and the
 * grid rows are both derived from the same `bounds`, so they cannot drift.
 * No React, no I/O.
 */
import type { BookingHours } from "@/lib/scheduling/hours-types";
import { windowsForDate } from "@/lib/scheduling/hours-types";

export const DEFAULT_OPEN = 10 * 60;
export const DEFAULT_CLOSE = 19 * 60;

export type GridBounds = { startMin: number; endMin: number };

export function localYmd(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function sameDay(a: Date, b: Date): boolean {
  return localYmd(a) === localYmd(b);
}

export function minutesOfDay(date: Date): number {
  return date.getHours() * 60 + date.getMinutes();
}

export function dayWindows(hours: BookingHours | null | undefined, day: Date) {
  if (!hours) return [{ startMin: DEFAULT_OPEN, endMin: DEFAULT_CLOSE }];
  return windowsForDate(hours, localYmd(day), day.getDay() as 0 | 1 | 2 | 3 | 4 | 5 | 6);
}

/**
 * Visible hour range: working hours plus one hour of outside-hours band on
 * each side, stretched so the now-line is on screen when today is in view.
 * Always whole hours. The default window applies only when no day in view has
 * a working window (a talent who works 12:00-16:00 must not get 09:00-20:00).
 */
export function gridBounds(hours: BookingHours | null | undefined, days: Date[], clock?: Date): GridBounds {
  let start = Infinity;
  let end = -Infinity;
  for (const day of days) {
    for (const win of dayWindows(hours, day)) {
      start = Math.min(start, win.startMin);
      end = Math.max(end, win.endMin);
    }
  }
  if (!Number.isFinite(start) || !Number.isFinite(end)) {
    start = DEFAULT_OPEN;
    end = DEFAULT_CLOSE;
  }
  start = Math.max(0, Math.floor((start - 60) / 60) * 60);
  end = Math.min(24 * 60, Math.ceil((end + 60) / 60) * 60);
  if (clock && days.some((day) => sameDay(day, clock))) {
    const now = minutesOfDay(clock);
    start = Math.min(start, Math.max(0, Math.floor((now - 30) / 60) * 60));
    end = Math.max(end, Math.min(24 * 60, Math.ceil((now + 30) / 60) * 60));
  }
  return { startMin: start, endMin: Math.max(end, start + 60) };
}

/** Snap arbitrary bounds (e.g. an overnight extension) to whole hours. */
export function normalizeBounds(bounds: GridBounds): GridBounds {
  const startMin = Math.max(0, Math.floor(bounds.startMin / 60) * 60);
  const endMin = Math.max(Math.ceil(bounds.endMin / 60) * 60, startMin + 60);
  return { startMin, endMin };
}

/**
 * The rail's hour marks: one per whole hour from start through end inclusive
 * (the closing line), strictly increasing, so never a duplicate label.
 */
export function hourRailMarks(bounds: GridBounds): number[] {
  const { startMin, endMin } = normalizeBounds(bounds);
  const marks: number[] = [];
  for (let min = startMin; min <= endMin; min += 60) marks.push(min);
  return marks;
}

export function hm(min: number): string {
  const m = Math.round(min);
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}
