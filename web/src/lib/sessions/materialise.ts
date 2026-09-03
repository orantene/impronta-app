/**
 * materialise.ts — deciding what the nightly cron should create, and when it
 * should refuse to create anything.
 *
 * PURE. No Supabase import, so it gates in every test lane. The runner (the
 * cron route) does the two writes this decides on and nothing else: an
 * `INSERT … ON CONFLICT (series_id, starts_at) DO NOTHING` per occurrence and
 * an `upsert_capacity_pool` per session. Both are idempotent by construction,
 * which is what makes "run it twice and count the rows" a real proof rather
 * than a reading of the code.
 *
 *
 * WHY THIS IS A SEPARATE LAYER FROM `expandSeries`
 * ═══════════════════════════════════════════════
 * `expandSeries` returns `[]` for a malformed spec AND for a well-formed
 * series that simply has no occurrence in the window. Both are correct answers
 * for an expander — it is a pure function over a spec and a range, and an
 * empty list is the honest result of "nothing here".
 *
 * They are NOT the same answer for a cron. "This series produced nothing this
 * week" is a normal Tuesday. "This series can never produce anything" is a
 * workspace whose classes will silently never appear, and the operator finds
 * out when a customer asks where the schedule went. So this layer separates
 * them: a malformed spec is a `refused` decision with a reason, never an empty
 * `create` list.
 *
 * That distinction is the local instance of a rule this department has paid for
 * four times in one day: a function that answers where the honest output is
 * "there is no answer" fails silently, because a plausible value is
 * indistinguishable from a correct one downstream.
 *
 *
 * THE TIMEZONE REFUSAL, WHICH IS THE POINT OF THIS FILE
 * ════════════════════════════════════════════════════
 * `venues.timezone` is `text NOT NULL DEFAULT 'UTC'`, and on 2026-09-03 all
 * thirteen venues in production carried that default — including two named
 * "Riviera Maya Work" and one "Casa Muna", which are not in UTC. So the stored
 * zone cannot distinguish "the operator chose UTC" from "nobody has ever opened
 * the venue screen".
 *
 * For most features reading that column, guessing wrong is cosmetic. Here it is
 * the entire feature: a class in Playa del Carmen materialises six hours off,
 * at instants that are all perfectly valid, and the first signal is a customer
 * arriving to an empty room. There is no later check that catches it, because
 * nothing downstream knows what hour was intended.
 *
 * So the series carries the zone the operator CONFIRMED (`session_series.
 * timezone`), and this decides `refused` when it is absent. That column is a
 * deliberate second store of a timezone, and the reason it is not the mistake
 * it looks like: `venues.timezone` answers "where is this venue now";
 * `session_series.timezone` answers "what did the operator agree these classes
 * recur in". A venue that moves city must not silently reschedule twelve weeks
 * of sold classes.
 */

import { expandSeries, parseLocalTime, type IsoWeekday, type Occurrence } from "./recurrence";

/** How far ahead the cron materialises. "Sessions appear this far in advance." */
export const DEFAULT_HORIZON_DAYS = 90;

/** A series as this layer needs it. Mirrors `session_series` minus the noise. */
export type SeriesInput = {
  id: string;
  tenantId: string;
  title: string;
  /** Wall clock, "HH:MM". Never an instant. */
  localTime: string;
  /**
   * The zone the operator CONFIRMED for this series. Null means unconfirmed,
   * which is a refusal and never a fallback to UTC. See the header.
   */
  timeZone: string | null;
  weekdays: readonly IsoWeekday[];
  durationMinutes: number;
  /** Inclusive local dates, "YYYY-MM-DD". */
  startsOn: string;
  endsOn?: string | null;
  seats: number;
  isActive: boolean;
};

/** An occurrence that already exists in `sessions`, keyed as the DB keys it. */
export type ExistingOccurrence = {
  /** ISO instant, exactly as `sessions.starts_at` serialises. */
  startsAt: string;
};

export type MaterialiseRefusal =
  | "series_inactive"
  /** No confirmed timezone. The one that matters. */
  | "timezone_unconfirmed"
  | "timezone_unknown"
  | "invalid_local_time"
  | "no_weekdays"
  | "invalid_duration"
  | "invalid_seats"
  | "invalid_window";

export type MaterialiseDecision =
  | {
      ok: true;
      seriesId: string;
      /** Occurrences with no row yet. Possibly empty, which is a normal week. */
      create: Occurrence[];
      /** Occurrences already materialised. Counted, never re-created. */
      existing: number;
      timeZone: string;
      seats: number;
    }
  | { ok: false; seriesId: string; reason: MaterialiseRefusal };

/** Cheap validity check for an IANA zone, without pulling a tz database in. */
function isResolvableZone(timeZone: string): boolean {
  if (typeof timeZone !== "string" || timeZone.trim().length === 0) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone }).format(new Date(0));
    return true;
  } catch {
    return false;
  }
}

/** "YYYY-MM-DD" `days` after `from`, in UTC space where a day is always 24h. */
function utcDatePlus(from: Date, days: number): string {
  return new Date(from.getTime() + days * 86_400_000).toISOString().slice(0, 10);
}

/**
 * What the cron should create for one series.
 *
 * `now` is the floor: the past is never materialised, because a series edited
 * today must not conjure occurrences for last month, and because a re-run must
 * not resurrect an occurrence a human cancelled. `existing` is what is already
 * in `sessions` for this series — the unique index makes re-creating one a
 * no-op anyway, so this is for reporting an honest count, not for correctness.
 */
export function decideMaterialisation(
  series: SeriesInput,
  existing: ReadonlyArray<ExistingOccurrence>,
  now: Date = new Date(),
  horizonDays: number = DEFAULT_HORIZON_DAYS,
): MaterialiseDecision {
  const refuse = (reason: MaterialiseRefusal): MaterialiseDecision => ({
    ok: false,
    seriesId: series.id,
    reason,
  });

  if (!series.isActive) return refuse("series_inactive");
  // Null, empty and whitespace are all "nobody confirmed one". Checked BEFORE
  // resolvability so an unconfirmed zone never reports as an unknown one — two
  // different problems with two different fixes.
  if (series.timeZone == null || series.timeZone.trim().length === 0) {
    return refuse("timezone_unconfirmed");
  }
  const timeZone = series.timeZone.trim();
  if (!isResolvableZone(timeZone)) return refuse("timezone_unknown");
  if (parseLocalTime(series.localTime) == null) return refuse("invalid_local_time");
  // cardinality, not "is it an array": an empty weekday set expands to nothing
  // for ever, which is the failure this refusal exists to name.
  if (series.weekdays.length === 0) return refuse("no_weekdays");
  if (
    !Number.isInteger(series.durationMinutes) ||
    series.durationMinutes <= 0 ||
    series.durationMinutes > 1440
  ) {
    return refuse("invalid_duration");
  }
  if (!Number.isInteger(series.seats) || series.seats < 0) return refuse("invalid_seats");
  if (!Number.isFinite(now.getTime()) || !Number.isInteger(horizonDays) || horizonDays <= 0) {
    return refuse("invalid_window");
  }

  // The window runs from today, never from `startsOn`: a series that began in
  // March must not backfill March every night for ever.
  const from = utcDatePlus(now, 0);
  const through = utcDatePlus(now, horizonDays);

  const expanded = expandSeries(
    {
      localTime: series.localTime,
      timeZone,
      weekdays: series.weekdays,
      durationMinutes: series.durationMinutes,
      startsOn: series.startsOn,
      endsOn: series.endsOn ?? null,
    },
    from,
    through,
  );

  // Compare on the INSTANT, because that is what the unique index is on. Two
  // wall clocks can read the same and be different instants across a
  // transition, and two different-looking ISO strings can be the same instant.
  const already = new Set<number>();
  for (const row of existing) {
    const at = Date.parse(row.startsAt);
    if (Number.isFinite(at)) already.add(at);
  }

  const create = expanded.filter((occ) => !already.has(Date.parse(occ.startsAt)));

  return {
    ok: true,
    seriesId: series.id,
    create,
    existing: expanded.length - create.length,
    timeZone,
    seats: series.seats,
  };
}
