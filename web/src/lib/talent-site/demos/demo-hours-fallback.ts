/**
 * TUL-539 / GRK-002: public slots for allow-listed demos when
 * `talent_booking_hours` was never seeded (sheet shows `no_booking_hours`).
 *
 * Real talents stay fail-closed. Demos only — roster hours when known,
 * otherwise a window wide enough for the requested duration.
 *
 * PURE. No DB.
 */

import type { BookingHours, WeekdayIndex } from "@/lib/scheduling/hours-types";
import {
  resolvedDemoBookingHours,
  type DemoHoursSpec,
} from "./demo-booking-hours";

/** Explicit roster windows (must match `scripts/demo-talents/demos.ts`). */
const ROSTER_HOURS: Readonly<
  Record<string, { city: string; hours: DemoHoursSpec }>
> = {
  // Diego Navarro DJ — 5h wedding set needs a wide evening window.
  "TAL-93005": {
    city: "Monterrey",
    hours: {
      timezone: "America/Monterrey",
      days: [4, 5, 6, 0],
      startMin: 16 * 60,
      endMin: 23 * 60,
      slotMinutes: 60,
    },
  },
};

export function bookingHoursFromDemoSpec(spec: DemoHoursSpec): BookingHours {
  const weekly: BookingHours["weekly"] = {
    0: [],
    1: [],
    2: [],
    3: [],
    4: [],
    5: [],
    6: [],
  };
  const window = [{ startMin: spec.startMin, endMin: spec.endMin }];
  for (const day of spec.days) {
    if (day < 0 || day > 6) continue;
    weekly[day as WeekdayIndex] = window;
  }
  return {
    timezone: spec.timezone,
    weekly,
    exceptions: [],
    slotMinutes: spec.slotMinutes > 0 ? spec.slotMinutes : 60,
    bufferBeforeMin: 0,
    bufferAfterMin: 0,
    minNoticeMin: 120,
    // Public picker needs a short horizon so "next 7 days" is bookable.
    horizonDays: 14,
  };
}

/**
 * When a demo has no (or unreadable) hours row, synthesize BookingHours from
 * the seed roster / duration. Returns null for non-demos or quote-only.
 */
export function demoPublicBookingHoursFallback(input: {
  isDemo: boolean;
  profileCode: string | null | undefined;
  homeCity?: string | null;
  durationMinutes: number;
}): BookingHours | null {
  if (!input.isDemo) return null;
  const duration =
    typeof input.durationMinutes === "number" && input.durationMinutes > 0
      ? input.durationMinutes
      : 60;
  const code = (input.profileCode ?? "").trim();
  const roster = code ? ROSTER_HOURS[code] : undefined;
  const city =
    roster?.city ||
    (typeof input.homeCity === "string" && input.homeCity.trim()) ||
    "Ciudad de México";
  const spec = resolvedDemoBookingHours({
    city,
    services: [{ durationMin: duration, booking: "request" }],
    hours: roster?.hours ?? null,
  });
  if (!spec) return null;
  return bookingHoursFromDemoSpec(spec);
}
