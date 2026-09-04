/**
 * recurrence.ts — expanding "Tuesdays at 18:00" into real instants.
 *
 * THE WHOLE POINT: A WALL CLOCK IS NOT AN INSTANT.
 * ───────────────────────────────────────────────
 * "The class is at 18:00" is a statement about a clock on a wall in a place. It
 * is NOT a fixed number of milliseconds from any other occurrence. Between two
 * Tuesdays a daylight-saving transition can move the wall clock relative to UTC,
 * so the naive expansion —
 *
 *     next = new Date(previous.getTime() + 7 * 24 * 60 * 60 * 1000)
 *
 * — silently produces a class at 17:00 or 19:00 local for half the year. It is
 * silent because every date it produces is valid, the series looks correct in
 * UTC, and nobody notices until a customer arrives an hour late.
 *
 * So an occurrence resolves its LOCAL wall clock against the venue's IANA zone,
 * per occurrence, never by adding a duration to the previous one.
 *
 * THE ZONE MATH IS NOT DONE HERE. It is `lib/scheduling/tz.ts`, which Appointments
 * already shipped, and this module delegates to it.
 *
 * That is a correction. This file originally carried its own resolver — a second
 * implementation of the same conversion, with a DIFFERENT and undocumented DST
 * gap policy: it returned the instant the clock reaches (02:30 on a spring-forward
 * day became 03:30), where `tz.ts` returns null and the caller skips. Both are
 * defensible in isolation. Two of them in one codebase is the shape this repo has
 * an incident file about — two guards asserting opposite things.
 *
 * The resolution was NOT that one policy won. Both callers were right for their
 * own case: for an appointment SLOT, a wall clock that does not exist is nothing
 * to offer, so `null` is correct; for a recurring CLASS, the studio opens on the
 * gap day and the class happens, so skipping would delete one class a year in
 * every DST zone, silently. Collapsing them to a single default would have been a
 * third bug. So the policy became a PARAMETER, named at the call site —
 * `{ gap: "skip" | "next" }`, defaulting to "skip" so every pre-existing caller
 * stayed byte-identical. This module passes "next" deliberately.
 *
 * DST policy, inherited from tz.ts and now single-sourced:
 *   - spring-forward gap → the occurrence RUNS when the clock reaches it (gap: "next").
 *     Skipping would delete one class a year in every DST zone, silently.
 *   - fall-back ambiguity (it happens twice) → the FIRST occurrence, earliest UTC
 *
 * Pure — no Supabase import — so it runs in every test lane.
 */

import {
  addUtcDays,
  isValidIanaTimeZone,
  utcToZonedHmm,
  utcToZonedYmd,
  weekdayUtc,
  zonedLocalToUtc,
} from "@/lib/scheduling/tz";

/** ISO weekday: 1 = Monday … 7 = Sunday, matching Postgres `isodow`. */
export type IsoWeekday = 1 | 2 | 3 | 4 | 5 | 6 | 7;

export type SeriesSpec = {
  /** "18:00" or "18:00:00" — a wall clock in `timeZone`, never an instant. */
  localTime: string;
  timeZone: string;
  weekdays: readonly IsoWeekday[];
  durationMinutes: number;
  /** Inclusive local date, "YYYY-MM-DD". */
  startsOn: string;
  /** Inclusive local date, or null for open-ended. */
  endsOn?: string | null;
};

export type Occurrence = {
  /** Absolute instant, ISO 8601 with offset. */
  startsAt: string;
  endsAt: string;
  /** The local date this occurrence belongs to, "YYYY-MM-DD". */
  localDate: string;
};

const MINUTE_MS = 60_000;

/** Parse "18:00" / "18:00:00" into minutes past local midnight. */
export function parseLocalTime(localTime: string): number | null {
  const m = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(localTime.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

/**
 * ISO weekday (Mon=1 … Sun=7, matching Postgres `isodow`) of a civil date.
 *
 * `weekdayUtc` returns JS 0=Sunday; the shift to ISO happens here because the
 * database column is `isodow` and a mismatch would put every Sunday class on a
 * Monday. Invalid dates return null rather than a weekday, because `Date.UTC`
 * rolls 2027-13-40 into a real date a year away.
 */
export function isoWeekdayOf(localDate: string): IsoWeekday | null {
  const js = weekdayUtc(localDate);
  if (js == null) return null;
  return (js === 0 ? 7 : js) as IsoWeekday;
}

/**
 * The instant at which the wall clock in `timeZone` reads this local date and
 * time, or null when it does not exist (spring-forward gap) or the zone is
 * unknown. Delegates to the shipped resolver; see the header for why.
 */
export function zonedWallClockToUtc(
  localDate: string,
  minutesPastMidnight: number,
  timeZone: string,
): Date | null {
  // gap: "next" — a recurring CLASS happens on the gap day; the studio opens and
  // the teacher turns up. "skip" would delete one occurrence a year in every DST
  // zone with no error anywhere. An appointment slot wants the opposite, which is
  // why the policy is named here rather than baked into the resolver.
  return zonedLocalToUtc(localDate, minutesPastMidnight, timeZone, { gap: "next" });
}

function addLocalDays(localDate: string, days: number): string {
  return addUtcDays(localDate, days) ?? localDate;
}

/** Guard: a runaway `through` must not spin forever. Five years of dailies. */
const MAX_OCCURRENCES = 2000;

/**
 * Every occurrence of `spec` whose LOCAL DATE falls in [from, through].
 *
 * Iteration is over local DATES, and each date's instant is resolved
 * independently. That is the entire DST correctness argument: no occurrence is
 * ever derived from another, so no drift can accumulate and no transition can
 * shift the series.
 */
export function expandSeries(
  spec: SeriesSpec,
  from: string,
  through: string,
): Occurrence[] {
  const minutes = parseLocalTime(spec.localTime);
  if (minutes == null) return [];
  if (spec.durationMinutes <= 0) return [];
  if (spec.weekdays.length === 0) return [];
  if (!isValidIanaTimeZone(spec.timeZone)) return [];

  const wanted = new Set<number>(spec.weekdays);
  let cursor = spec.startsOn > from ? spec.startsOn : from;
  const last = spec.endsOn && spec.endsOn < through ? spec.endsOn : through;

  const out: Occurrence[] = [];
  while (cursor <= last && out.length < MAX_OCCURRENCES) {
    const dow = isoWeekdayOf(cursor);
    if (dow != null && wanted.has(dow)) {
      const startsAt = zonedWallClockToUtc(cursor, minutes, spec.timeZone);
      if (startsAt) {
        out.push({
          startsAt: startsAt.toISOString(),
          endsAt: new Date(startsAt.getTime() + spec.durationMinutes * MINUTE_MS).toISOString(),
          localDate: cursor,
        });
      }
    }
    cursor = addLocalDays(cursor, 1);
  }
  return out;
}

/** The local "YYYY-MM-DD" that `instant` falls on in `timeZone`. */
export function localDateIn(instant: Date, timeZone: string): string | null {
  return utcToZonedYmd(instant, timeZone);
}

/** The local "HH:MM" that `instant` reads in `timeZone`. Used by the tests. */
export function localTimeIn(instant: Date, timeZone: string): string | null {
  return utcToZonedHmm(instant, timeZone);
}
