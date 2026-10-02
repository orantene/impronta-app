/**
 * One source of truth for "when do you work" (F27, 2026-09-30).
 *
 * DECISION. `talent_booking_hours` is the only store every engine reads
 * (instant readiness, public slots, the agenda, the Visit block). The profile
 * drawer's availability pattern ("Weekdays only", "Weekends only", "Busy on")
 * is not a second store: saving it WRITES the open days into the hours row,
 * and saving hours in Settings > Working hours writes the matching pattern
 * back. A new talent who picks "Weekdays only" therefore gets bookable
 * Mon-Fri hours (default window below) and instant booking works, without a
 * second trip to Settings.
 *
 * Rules:
 *  - a day the pattern opens keeps its saved window, or gets the default one;
 *  - a day the pattern closes is emptied;
 *  - "none" (or no pattern) says nothing, so the hours are left alone.
 *
 * Pure. The IO half is `sync-hours-from-pattern.server.ts`.
 */
import type { LocalWindow, WeekdayIndex, WeeklyHours } from "./hours-types";

/** Default window for a day the pattern opens: 10:00 to 19:00 local. */
export const PATTERN_DEFAULT_WINDOW: LocalWindow = { startMin: 10 * 60, endMin: 19 * 60 };

const ALL_DAYS: readonly WeekdayIndex[] = [0, 1, 2, 3, 4, 5, 6];

export type AvailabilityRecurring = { kind?: string; busyDays?: number[] } | null | undefined;

/** The weekdays a recurring pattern opens, or null when it says nothing. */
export function openDaysForPattern(recurring: AvailabilityRecurring): WeekdayIndex[] | null {
  switch (recurring?.kind) {
    case "weekdays-only":
      return [1, 2, 3, 4, 5];
    case "weekends-only":
      return [0, 6];
    case "weekly-busy": {
      const busy = new Set((recurring.busyDays ?? []).filter((d) => Number.isInteger(d)));
      const open = ALL_DAYS.filter((d) => !busy.has(d));
      return open.length > 0 ? open : null;
    }
    default:
      return null;
  }
}

/** Read the recurring pattern out of `talent_profiles.availability_data`. */
export function recurringFromAvailabilityData(data: unknown): AvailabilityRecurring {
  if (!data || typeof data !== "object") return null;
  const r = (data as { recurring?: unknown }).recurring;
  return r && typeof r === "object" ? (r as AvailabilityRecurring) : null;
}

/** True when the picked pattern differs from the saved one (kind or busy days). */
export function recurringChanged(before: AvailabilityRecurring, after: AvailabilityRecurring): boolean {
  const days = (r: AvailabilityRecurring) =>
    [...(r?.busyDays ?? [])].sort((a, b) => a - b).join(",");
  return (before?.kind ?? "none") !== (after?.kind ?? "none") || days(before) !== days(after);
}

/**
 * Weekly hours implied by the pattern, keeping any saved window on a day it
 * opens. Null when the pattern says nothing (leave the hours alone).
 */
export function weeklyFromAvailabilityPattern(
  recurring: AvailabilityRecurring,
  existing: WeeklyHours | null | undefined,
): WeeklyHours | null {
  const open = openDaysForPattern(recurring);
  if (!open) return null;
  const openSet = new Set(open);
  const out = { 0: [], 1: [], 2: [], 3: [], 4: [], 5: [], 6: [] } as WeeklyHours;
  for (const day of ALL_DAYS) {
    if (!openSet.has(day)) continue;
    const saved = existing?.[day] ?? [];
    out[day] = saved.length > 0 ? saved.map((w) => ({ ...w })) : [{ ...PATTERN_DEFAULT_WINDOW }];
  }
  return out;
}

/** Days with at least one window. */
export function openDaysOfWeekly(weekly: WeeklyHours | null | undefined): WeekdayIndex[] {
  if (!weekly) return [];
  return ALL_DAYS.filter((d) => (weekly[d] ?? []).length > 0);
}

/**
 * The drawer pattern that matches saved hours, or null when no pattern
 * describes them (then the drawer keeps what it had). All seven days open
 * reads as "none" (no restriction).
 */
export function patternFromWeekly(weekly: WeeklyHours | null | undefined): { kind: string } | null {
  const open = openDaysOfWeekly(weekly).join(",");
  if (open === "1,2,3,4,5") return { kind: "weekdays-only" };
  if (open === "0,6") return { kind: "weekends-only" };
  if (open === "0,1,2,3,4,5,6") return { kind: "none" };
  return null;
}

export function sameWeekly(a: WeeklyHours | null | undefined, b: WeeklyHours | null | undefined): boolean {
  if (!a || !b) return a === b;
  return ALL_DAYS.every((d) => {
    const x = a[d] ?? [];
    const y = b[d] ?? [];
    return x.length === y.length && x.every((w, i) => w.startMin === y[i]!.startMin && w.endMin === y[i]!.endMin);
  });
}
