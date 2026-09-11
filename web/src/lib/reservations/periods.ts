/**
 * Map service_periods rows onto the existing ServiceWindow shape.
 * When any period exists for the venue's locations, those windows replace
 * venue_service_windows for that load. Absence falls back to today's path.
 */
import type { IsoWeekday, ServiceWindow } from "./types";

export type ServicePeriodRow = {
  id: string;
  location_id: string;
  name: string;
  weekday_mask: number;
  starts_local: string;
  ends_local: string;
  turn_minutes: number;
};

function minutesFromTime(value: string): number | null {
  const m = /^(\d{2}):(\d{2})/.exec(value);
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

function weekdaysFromMask(mask: number): IsoWeekday[] {
  const days: IsoWeekday[] = [];
  for (let iso = 1; iso <= 7; iso += 1) {
    if (mask & (1 << (iso - 1))) days.push(iso as IsoWeekday);
  }
  return days;
}

export function periodsToWindows(rows: readonly ServicePeriodRow[], venueId: string): ServiceWindow[] {
  const out: ServiceWindow[] = [];
  for (const row of rows) {
    const start = minutesFromTime(row.starts_local);
    const end = minutesFromTime(row.ends_local);
    if (start === null || end === null || end <= start) continue;
    const weekdays = weekdaysFromMask(row.weekday_mask);
    if (weekdays.length === 0) continue;
    out.push({
      id: row.id,
      venueId,
      key: row.name,
      localTimeMin: start,
      durationMinutes: end - start,
      weekdays,
      lastSeatingOffsetMin: null,
      seatingStepMinutes: 15,
      turnMinutesOverride: row.turn_minutes,
      startsOn: "1970-01-01",
      endsOn: null,
      isActive: true,
    });
  }
  return out;
}
