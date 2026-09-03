/**
 * windows.ts — a recurring service window, resolved onto one date, as instants.
 *
 * THE THREE DST RULES THIS FILE EXISTS TO HOLD
 *
 * 1. A WALL CLOCK IS NOT AN INSTANT. `localTimeMin` is a reading on a clock in
 *    a place. Resolution goes through `zonedWallClockToUtc`, per date, never by
 *    adding seven days to a previous occurrence.
 *
 * 2. THE GAP POLICY IS NAMED AT EVERY CALL SITE. Two resolvers live on main
 *    with opposite hard-coded answers — `scheduling/tz.ts` refuses a wall clock
 *    inside a spring-forward gap, `sessions/recurrence.ts` returns the instant
 *    the clock actually reaches — so inheriting one by import is a coin flip
 *    nobody knows they are tossing. A service window needs BOTH: its own
 *    boundaries resolve "next", because refusing would close a restaurant whose
 *    doors are open, while an offered seating resolves "skip", because 02:30
 *    moved to 03:30 collides with the real 03:30 seating and the page then
 *    offers one instant twice under two labels.
 *
 * 3. EVERY DURATION IS ADDED TO THE INSTANT, NEVER TO THE WALL CLOCK. Measured
 *    on this repo, Europe/Madrid 2027-03-28: a 90 minute turn from a 01:30
 *    seating, computed as "wall clock plus 90 then resolve", holds the table for
 *    30 real minutes and frees it while the party is still eating. That is an
 *    oversell with a once-a-year trigger, and the wrong version reads as
 *    obviously correct.
 *
 * PURE. No DB.
 */

import { zonedWallClockToUtc } from "@/lib/sessions/recurrence";
import type {
  GapPolicy,
  IsoWeekday,
  ResolvedWindow,
  SeatingOption,
  ServiceWindow,
  ServiceWindowException,
  WindowResolution,
} from "./types";

const MINUTE_MS = 60_000;
const YMD_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * A wall clock resolved in a zone, with the gap policy stated by the caller.
 *
 * Returns `null` under "skip" when the reading does not exist, and under either
 * policy when the zone or the date is unusable. The caller cannot get an answer
 * without having said what an impossible time means to them.
 */
export function resolveWallClock(
  ymd: string,
  minutesPastMidnight: number,
  timeZone: string,
  gap: GapPolicy,
): Date | null {
  const resolved = zonedWallClockToUtc(ymd, minutesPastMidnight, timeZone);
  if (resolved === null) return null;
  if (gap === "next") return resolved;

  // "skip": the instant must read back as the wall clock we asked for. When it
  // does not, the reading never happened and there is nothing honest to return.
  const readsBack = wallClockMinutesAt(resolved, timeZone);
  if (readsBack === null) return null;
  const wanted = ((minutesPastMidnight % 1440) + 1440) % 1440;
  return readsBack === wanted ? resolved : null;
}

/** Minutes past local midnight that `instant` reads as in `timeZone`, or null. */
function wallClockMinutesAt(instant: Date, timeZone: string): number | null {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).formatToParts(instant);
    const hour = Number(parts.find((p) => p.type === "hour")?.value);
    const minute = Number(parts.find((p) => p.type === "minute")?.value);
    if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null;
    // Intl reports midnight as 24 in some ICU versions.
    return ((hour % 24) * 60 + minute) % 1440;
  } catch {
    return null;
  }
}

/** "HH:MM" as read on the wall clock in `timeZone`, or null. */
export function localLabel(instant: Date, timeZone: string): string | null {
  const mins = wallClockMinutesAt(instant, timeZone);
  if (mins === null) return null;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** ISO weekday of a `YYYY-MM-DD`, 1 = Monday … 7 = Sunday. Null if unparseable. */
export function isoWeekdayOf(ymd: string): IsoWeekday | null {
  const m = YMD_RE.exec(ymd);
  if (!m) return null;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  if (Number.isNaN(d.getTime())) return null;
  // Guard against a rolled-over date: 2026-02-31 parses but is not that day.
  if (d.getUTCMonth() !== Number(m[2]) - 1 || d.getUTCDate() !== Number(m[3])) return null;
  const dow = d.getUTCDay(); // 0 = Sunday
  return (dow === 0 ? 7 : dow) as IsoWeekday;
}

/**
 * The exception that applies to a window on a date, if any.
 *
 * A venue-wide row (`windowId === null`) wins over a per-window row, because
 * "we are shut on the 25th" is a statement about the building and cannot be
 * overridden by a rule about one service.
 */
export function exceptionFor(
  exceptions: readonly ServiceWindowException[],
  windowId: string,
  onDate: string,
): ServiceWindowException | null {
  let perWindow: ServiceWindowException | null = null;
  for (const e of exceptions) {
    if (e.onDate !== onDate) continue;
    if (e.windowId === null) return e;
    if (e.windowId === windowId) perWindow = e;
  }
  return perWindow;
}

/**
 * Resolve one window onto one date in the venue's zone.
 *
 * Refusals are NAMED, not an empty result: "we are closed today" and "this
 * venue has no dinner service" are different answers and the page says
 * different words for them.
 */
export function resolveWindowOnDate(input: {
  window: ServiceWindow;
  exceptions: readonly ServiceWindowException[];
  onDate: string;
  timeZone: string;
  defaultTurnMinutes: number;
}): WindowResolution {
  const { window: w, exceptions, onDate, timeZone, defaultTurnMinutes } = input;

  if (!w.isActive) return { ok: false, reason: "inactive" };

  const weekday = isoWeekdayOf(onDate);
  if (weekday === null) return { ok: false, reason: "outside_series_dates" };

  if (onDate < w.startsOn) return { ok: false, reason: "outside_series_dates" };
  if (w.endsOn !== null && onDate > w.endsOn) {
    return { ok: false, reason: "outside_series_dates" };
  }

  const exception = exceptionFor(exceptions, w.id, onDate);
  if (exception?.isClosed) return { ok: false, reason: "closed_by_exception" };

  // The weekday test comes AFTER the exception lookup on purpose: an override
  // may open a window on a day the rule does not cover ("brunch only this
  // Sunday"), and testing first would refuse it before the override was seen.
  const overridesTime =
    exception !== null &&
    (exception.localTimeMin !== null || exception.durationMinutes !== null);
  if (!w.weekdays.includes(weekday) && !overridesTime) {
    return { ok: false, reason: "not_on_this_weekday" };
  }

  const localTimeMin = exception?.localTimeMin ?? w.localTimeMin;
  const durationMinutes = exception?.durationMinutes ?? w.durationMinutes;

  // RULE 2: a boundary resolves "next". If dinner's start lands in the gap,
  // refusing would close a restaurant whose doors are open.
  const startsAt = resolveWallClock(onDate, localTimeMin, timeZone, "next");
  if (startsAt === null) return { ok: false, reason: "unknown_timezone" };

  // RULE 3: the end is the START INSTANT plus the length. Never the wall clock
  // plus the length, which loses or gains an hour across a transition.
  const endsAt = new Date(startsAt.getTime() + durationMinutes * MINUTE_MS);

  const lastOffset = exception?.lastSeatingOffsetMin ?? w.lastSeatingOffsetMin;
  const lastSeatingAt =
    lastOffset === null
      ? // NULL means "the window's end minus a turn", which is a different
        // statement from 0, which means "no seatings at all".
        new Date(endsAt.getTime() - defaultTurnMinutes * MINUTE_MS)
      : new Date(startsAt.getTime() + lastOffset * MINUTE_MS);

  return {
    ok: true,
    window: {
      windowId: w.id,
      key: w.key,
      onDate,
      startsAt,
      endsAt,
      lastSeatingAt,
      seatingStepMinutes: w.seatingStepMinutes,
      turnMinutesOverride: w.turnMinutesOverride,
    },
  };
}

/**
 * The seating times a window offers for a party, as instants.
 *
 * Two guards that both exist because of one hour a year:
 *
 *  - Each candidate wall clock resolves with gap "skip", so a reading that does
 *    not exist is DROPPED rather than moved.
 *  - Survivors are deduplicated BY INSTANT, not by label. Under a fall-back
 *    repeat two different wall clocks can name the same moment, and offering
 *    both would put two rows in the book at one instant with two parties told
 *    different times.
 */
export function seatingTimesFor(input: {
  resolved: ResolvedWindow;
  timeZone: string;
  turnMinutes: number;
}): SeatingOption[] {
  const { resolved, timeZone, turnMinutes } = input;
  const step = Math.max(5, resolved.seatingStepMinutes);
  if (resolved.lastSeatingAt.getTime() < resolved.startsAt.getTime()) return [];

  const startMin = wallClockMinutesAt(resolved.startsAt, timeZone);
  if (startMin === null) return [];

  // The candidates are WALL CLOCKS, because "19:00, 19:15, 19:30" is what a
  // restaurant means by a seating grid. The BOUND is an INSTANT, because
  // lastSeatingAt is a moment. Bounding the loop by the instant span instead
  // would stop an hour early on spring-forward night and an hour late on
  // fall-back night, since the two spans differ by exactly the transition.
  const instantSpan = Math.floor(
    (resolved.lastSeatingAt.getTime() - resolved.startsAt.getTime()) / MINUTE_MS,
  );
  // Wall-clock minutes can exceed instant minutes by at most one transition;
  // two hours is a safe ceiling for every zone in the tz database.
  const walkLimit = instantSpan + 120;

  const seen = new Set<number>();
  const options: SeatingOption[] = [];

  for (let offset = 0; offset <= walkLimit; offset += step) {
    const at = resolveWallClock(resolved.onDate, startMin + offset, timeZone, "skip");
    if (at === null) continue; // the clock never read this; do not move it
    if (at.getTime() > resolved.lastSeatingAt.getTime()) continue;
    if (seen.has(at.getTime())) continue; // one instant, one offer
    seen.add(at.getTime());

    const label = localLabel(at, timeZone);
    if (label === null) continue;

    options.push({
      startsAt: at,
      // RULE 3 again: the turn is added to the INSTANT.
      endsAt: new Date(at.getTime() + turnMinutes * MINUTE_MS),
      localLabel: label,
      isLastSeating: false,
    });
  }

  options.sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
  const last = options[options.length - 1];
  if (last) last.isLastSeating = true;
  return options;
}
