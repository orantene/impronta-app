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

/**
 * Parse ?from=YYYY-MM-DD or an ISO instant. Missing / garbage → now.
 *
 * NEVER EARLIER THAN NOW. The public picker sends today's date, which parses
 * to midnight UTC, and `generateSlots` counts notice from `from` — so at
 * 15:24Z the page offered 15:00Z, and a guest could confirm a manicure that
 * had already started. A day that is today floors to this instant; a day
 * that is still to come keeps its midnight; the past is not for sale.
 */
export function parsePublicSlotFrom(raw: string | null | undefined, now: Date = new Date()): Date {
  if (raw == null || raw.trim() === "") return now;
  const trimmed = raw.trim();
  const ymd = YMD_RE.exec(trimmed);
  const parsed = ymd
    ? new Date(Date.UTC(Number(ymd[1]), Number(ymd[2]) - 1, Number(ymd[3])))
    : new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) return now;
  return parsed.getTime() < now.getTime() ? now : parsed;
}

/**
 * Why a slot list came back empty.
 *
 * An empty array is three different facts wearing one coat: nobody has set
 * hours, the hours are set but closed across the requested window, and every
 * open minute is already taken. As of today the FIRST is the live one for
 * every bookable offering in production - 161 of 161, across 51 talents,
 * because `talent_booking_hours` has no rows at all - and the endpoint said
 * exactly what a fully-booked barber says. That is the shape this repo has an
 * incident file about: make absence structurally distinct from a value.
 */
export type NoSlotsReason =
  /** No hours row, or a row whose week has no open window on any day. */
  | "no_booking_hours"
  /** Hours exist, but none fall inside the requested window. */
  | "closed_in_window"
  /** Open time exists in the window; holds and bookings have taken all of it. */
  | "fully_booked";

export type PublicSlots = {
  starts: string[];
  /** Null whenever `starts` is non-empty. */
  reason: NoSlotsReason | null;
};

export type PublicSlotsInput = {
  hours: BookingHours | null;
  durationMinutes: number;
  from: Date;
  days: number;
  busy?: readonly BusyInterval[];
  /**
   * Talent selling defaults (`talent_profiles.selling_defaults`). When
   * `bufferBeforeMin`, `bufferAfterMin`, or `minNoticeMin` is a number, it
   * replaces the hours-row value for this computation. Absent keys leave the
   * hours row alone.
   */
  sellingDefaults?: unknown;
  /** Per-service cleanup buffer. Wins over the defaults buffer when it is a number. */
  offeringBufferAfterMin?: number | null;
  /** Per-service prep buffer. Wins over defaults when set. */
  offeringBufferBeforeMin?: number | null;
};


function finiteInt(v: unknown, min: number, max: number): number | null {
  if (typeof v !== "number" || !Number.isFinite(v)) return null;
  const n = Math.trunc(v);
  if (n < min || n > max) return null;
  return n;
}

/**
 * Services defaults are saved on the profile, not on `talent_booking_hours`.
 * Slot generation only reads the hours object, so this copies the saved
 * prep (before), buffer-after, and minimum notice onto it before any start
 * is offered. Prep minutes block adjacent starts the same way the hours-row
 * `bufferBeforeMin` does.
 */
export function applySellingTimeToHours(
  hours: BookingHours,
  sellingDefaults: unknown,
  offeringBufferAfterMin?: number | null,
  offeringBufferBeforeMin?: number | null,
): BookingHours {
  const raw =
    sellingDefaults && typeof sellingDefaults === "object" && !Array.isArray(sellingDefaults)
      ? (sellingDefaults as Record<string, unknown>)
      : null;
  const fromDefaultsAfter = raw ? finiteInt(raw.bufferAfterMin, 0, 240) : null;
  const fromDefaultsBefore = raw ? finiteInt(raw.bufferBeforeMin, 0, 240) : null;
  const fromOfferingAfter =
    typeof offeringBufferAfterMin === "number" ? finiteInt(offeringBufferAfterMin, 0, 240) : null;
  const fromOfferingBefore =
    typeof offeringBufferBeforeMin === "number" ? finiteInt(offeringBufferBeforeMin, 0, 240) : null;
  const bufferAfter = fromOfferingAfter ?? fromDefaultsAfter;
  const bufferBefore = fromOfferingBefore ?? fromDefaultsBefore;
  const notice = raw ? finiteInt(raw.minNoticeMin, 0, 60 * 24 * 30) : null;
  if (bufferAfter == null && bufferBefore == null && notice == null) return hours;
  return {
    ...hours,
    ...(bufferBefore != null ? { bufferBeforeMin: bufferBefore } : {}),
    ...(bufferAfter != null ? { bufferAfterMin: bufferAfter } : {}),
    ...(notice != null ? { minNoticeMin: notice } : {}),
  };
}

function hasAnyOpenWindow(hours: BookingHours): boolean {
  const weeklyOpen = Object.values(hours.weekly).some((windows) => windows.length > 0);
  if (weeklyOpen) return true;
  // A week closed every day can still be opened by an exception, which is how
  // a pop-up or a one-off day is expressed. Treating that as "no hours" would
  // tell an operator to configure something they already configured.
  return hours.exceptions.some((e) => !e.closed && e.windows.length > 0);
}

/** Starts plus the reason there are none. `computePublicSlotStarts` is this, minus the reason. */
export function computePublicSlots(input: PublicSlotsInput): PublicSlots {
  const timed = input.hours
    ? applySellingTimeToHours(input.hours, input.sellingDefaults, input.offeringBufferAfterMin, input.offeringBufferBeforeMin)
    : null;
  if (!timed || !hasAnyOpenWindow(timed)) {
    return { starts: [], reason: "no_booking_hours" };
  }
  const days = clampPublicSlotDays(input.days);
  const horizon = Math.min(days, timed.horizonDays);
  const hours = { ...timed, horizonDays: horizon };
  const base = {
    hours,
    durationMinutes: input.durationMinutes,
    from: input.from,
  };
  const starts = generateSlots({ ...base, busy: input.busy }).map((s) =>
    s.startsAt.toISOString(),
  );
  if (starts.length > 0) return { starts, reason: null };

  // Only on the empty path, and only to tell two silences apart: recomputing
  // without busy says whether the window was ever open. Pure, so it costs a
  // walk of the same days and nothing else.
  const withoutBusy = generateSlots(base);
  return {
    starts,
    reason: withoutBusy.length > 0 ? "fully_booked" : "closed_in_window",
  };
}

/** Unchanged contract: the starts only. Delegates, so there is one computation. */
export function computePublicSlotStarts(input: PublicSlotsInput): string[] {
  return computePublicSlots(input).starts;
}
