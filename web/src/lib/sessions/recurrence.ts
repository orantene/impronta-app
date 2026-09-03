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
 * silent because every date it produces is a valid date, the series looks
 * correct in UTC, and nobody notices until a customer arrives an hour late.
 *
 * So an occurrence is computed by resolving the LOCAL wall-clock time against
 * the venue's IANA zone, per occurrence, never by adding a duration to the
 * previous one. `venues.timezone` exists as of Spaces S1; `agencies.timezone` is
 * the fallback.
 *
 * No dependency: `Intl.DateTimeFormat` with a `timeZone` can report what a given
 * instant looks like in a zone, and inverting that gives the instant for a
 * wanted wall-clock. That inversion is `zonedWallClockToUtc` below.
 *
 * Pure by design — no Supabase import — so it runs in every test lane. The
 * database stores the resolved `timestamptz`; this is what resolves it.
 */

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
const DAY_MS = 86_400_000;

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
 * What `instant` reads as on the wall clock in `timeZone`, as the epoch ms of
 * the same wall-clock reading interpreted as UTC. The difference between this
 * and `instant` is the zone's offset at that moment — which is how we invert.
 */
function wallClockAsUtcMs(instant: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(instant);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  // `hour12: false` can report midnight as 24 in some ICU versions.
  const hour = get("hour") % 24;
  return Date.UTC(get("year"), get("month") - 1, get("day"), hour, get("minute"), get("second"));
}

/**
 * The instant at which the wall clock in `timeZone` reads the given local date
 * and time. Returns null for an unknown zone.
 *
 * Two candidates are computed, using the zone's offset a day either side, and
 * the one that ROUND-TRIPS is correct. That check — does the instant read back
 * as the wall clock we asked for — is what makes the two edge cases right:
 *
 * SPRING-FORWARD GAP. On the day a zone skips 02:00→03:00, a 02:30 wall clock
 * does not exist and NEITHER candidate round-trips. An earlier version of this
 * function converged on 01:30, which is the dangerous answer: a class would run
 * an hour EARLY and silently, with customers arriving to find it over. We take
 * the later candidate instead, so the class runs at the moment the clock
 * actually reaches, 03:30 local. Chosen deliberately; matched to RFC 5545.
 *
 * AUTUMN FALL-BACK AMBIGUITY. When the clock repeats 01:00→02:00, a 01:30 wall
 * clock happens TWICE and both candidates round-trip. We take the earlier, which
 * is the first time the clock reads 01:30.
 */
export function zonedWallClockToUtc(
  localDate: string,
  minutesPastMidnight: number,
  timeZone: string,
): Date | null {
  const parsed = parseLocalDate(localDate);
  if (!parsed) return null;
  const asUtc = Date.UTC(parsed.y, parsed.m - 1, parsed.d, 0, minutesPastMidnight, 0);
  try {
    const offsetAt = (at: Date) => wallClockAsUtcMs(at, timeZone) - at.getTime();
    // Sample the offset a day either side, so a transition between them yields
    // two distinct candidates rather than one that depends on where we guessed.
    const candidates = [
      asUtc - offsetAt(new Date(asUtc - DAY_MS)),
      asUtc - offsetAt(new Date(asUtc + DAY_MS)),
    ]
      .filter((ms) => Number.isFinite(ms))
      .sort((a, b) => a - b)
      .map((ms) => new Date(ms));
    if (candidates.length === 0) return null;

    // The round trip IS the correctness test: does this instant read back as the
    // wall clock we asked for? Earliest match wins (fall-back ambiguity).
    for (const c of candidates) {
      if (wallClockAsUtcMs(c, timeZone) === asUtc) return c;
    }
    // Nothing round-trips: the wall clock is inside a spring-forward gap.
    // Take the LATER candidate — the instant the clock actually reaches.
    return candidates[candidates.length - 1];
  } catch {
    return null; // unknown IANA zone
  }
}

/**
 * Parse "YYYY-MM-DD" into real calendar parts, or null.
 *
 * The shape check is not enough: `Date.UTC` happily rolls 2027-13-40 over into
 * 2028-02-09, so a malformed date became a valid instant a year away rather
 * than an error. The round-trip below rejects both out-of-range months and
 * dates that do not exist, like 31 February.
 */
function parseLocalDate(localDate: string): { y: number; m: number; d: number } | null {
  const dm = /^(\d{4})-(\d{2})-(\d{2})$/.exec(localDate);
  if (!dm) return null;
  const y = Number(dm[1]);
  const m = Number(dm[2]);
  const d = Number(dm[3]);
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  const at = new Date(Date.UTC(y, m - 1, d));
  if (at.getUTCFullYear() !== y || at.getUTCMonth() !== m - 1 || at.getUTCDate() !== d) return null;
  return { y, m, d };
}

/** ISO weekday of a "YYYY-MM-DD" local date. */
export function isoWeekdayOf(localDate: string): IsoWeekday | null {
  const parsed = parseLocalDate(localDate);
  if (!parsed) return null;
  const d = new Date(Date.UTC(parsed.y, parsed.m - 1, parsed.d));
  if (!Number.isFinite(d.getTime())) return null;
  const js = d.getUTCDay(); // 0 = Sunday
  return (js === 0 ? 7 : js) as IsoWeekday;
}

function addLocalDays(localDate: string, days: number): string {
  const parsed = parseLocalDate(localDate);
  if (!parsed) return localDate;
  const d = new Date(Date.UTC(parsed.y, parsed.m - 1, parsed.d) + days * DAY_MS);
  return d.toISOString().slice(0, 10);
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
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(instant);
  } catch {
    return null;
  }
}

/** The local "HH:MM" that `instant` reads in `timeZone`. Used by the tests. */
export function localTimeIn(instant: Date, timeZone: string): string | null {
  try {
    return new Intl.DateTimeFormat("en-GB", {
      timeZone,
      hour12: false,
      hour: "2-digit",
      minute: "2-digit",
    }).format(instant);
  } catch {
    return null;
  }
}
