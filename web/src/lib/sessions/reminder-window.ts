/**
 * reminder-window.ts — "your class is tomorrow", where tomorrow is the VENUE's
 * tomorrow.
 *
 * PURE. No Supabase, no notifications — so the decision below is testable
 * without either, and the cron is only the I/O around it.
 *
 *
 * THE BUG THIS EXISTS TO NOT REPEAT
 * ═════════════════════════════════
 * The booking reminder cron computes tomorrow as `new Date()` plus a day, read
 * in UTC. That is right only for a venue in UTC, and every venue in production
 * is on the `venues.timezone` default rather than a confirmed zone. For a class
 * it is wrong twice:
 *
 *   a 20:00 class in Cancún is 01:00Z the NEXT day, so a UTC "tomorrow" sweep
 *   reminds a day early;
 *   a 01:00 show in Madrid is 23:00Z the PREVIOUS day, so it reminds a day late
 *   — which is to say, after it happened.
 *
 * Both send a real email at a plausible time about a real class. Nothing errors
 * and nothing looks wrong until somebody turns up on the wrong day.
 *
 *
 * WHY THE COMPARISON IS ON LOCAL DATES AND NOT ON A DURATION
 * ═════════════════════════════════════════════════════════
 * "Tomorrow" is a calendar fact, not 24 hours. On a DST boundary a local day is
 * 23 or 25 hours, so `now + 86_400_000` lands on the wrong date twice a year in
 * every zone that observes it. Both sides are converted to the venue's local
 * YYYY-MM-DD and compared as dates, and the day is advanced with `addUtcDays`,
 * which is calendar arithmetic in UTC space where a day is always 24 hours.
 *
 *
 * WHY IT REFUSES WITHOUT A ZONE
 * ═════════════════════════════
 * A session whose venue has no confirmed timezone gets NO reminder rather than
 * a UTC-guessed one. The same rule as the materialiser: `venues.timezone` is
 * `NOT NULL DEFAULT 'UTC'`, so the column cannot tell "chose UTC" from "never
 * opened the screen", and a reminder at a guessed hour is a plausible wrong
 * answer. A missing reminder is visible to the operator who expected it; a
 * reminder at the wrong hour is visible to nobody until a customer misses a
 * class.
 */

import { addUtcDays, utcToZonedYmd } from "@/lib/scheduling/tz";

/** A session as this decision needs it. */
export type RemindableSession = {
  id: string;
  /** ISO instant, as `sessions.starts_at` serialises. */
  startsAt: string;
  status: string;
  /** The venue's CONFIRMED zone. Null means no reminder, never a UTC guess. */
  timeZone: string | null;
};

export type ReminderRefusal =
  /** No confirmed zone — the one that matters, and the commonest. */
  | "timezone_unconfirmed"
  | "timezone_unknown"
  | "not_scheduled"
  | "invalid_start";

export type ReminderDecision =
  | { send: true; sessionId: string; localDate: string; timeZone: string }
  /** Not tomorrow. A normal answer for almost every session, every hour. */
  | { send: false; sessionId: string; reason: "not_tomorrow" }
  /** Cannot be decided. Distinct from "not tomorrow" — see below. */
  | { send: false; sessionId: string; reason: ReminderRefusal };

/**
 * Should this session's "tomorrow" reminder go out, given the moment the sweep
 * is running?
 *
 * `not_tomorrow` and the refusals are deliberately different answers even
 * though both mean "no email". "This class is not tomorrow" is the normal
 * result for almost every row on almost every run; "this class can never be
 * reminded about" is a workspace whose customers silently stop being told, and
 * a sweep that reported them the same way would hide the second inside the
 * first for ever.
 */
export function decideSessionReminder(
  session: RemindableSession,
  now: Date = new Date(),
): ReminderDecision {
  const id = session.id;

  // A cancelled session must never remind. Somebody being told to turn up to a
  // class that was called off is worse than telling them nothing.
  if (session.status !== "scheduled") {
    return { send: false, sessionId: id, reason: "not_scheduled" };
  }

  const startsAt = new Date(session.startsAt);
  if (!Number.isFinite(startsAt.getTime())) {
    return { send: false, sessionId: id, reason: "invalid_start" };
  }

  if (session.timeZone == null || session.timeZone.trim().length === 0) {
    return { send: false, sessionId: id, reason: "timezone_unconfirmed" };
  }
  const timeZone = session.timeZone.trim();

  // Both sides in the VENUE's clock. `utcToZonedYmd` returns null for a zone
  // Intl does not know, which is a different problem from an unset one.
  const sessionLocalDate = utcToZonedYmd(startsAt, timeZone);
  const nowLocalDate = utcToZonedYmd(now, timeZone);
  if (!sessionLocalDate || !nowLocalDate) {
    return { send: false, sessionId: id, reason: "timezone_unknown" };
  }

  // Calendar arithmetic, not +24h: a local day is 23 or 25 hours on a DST
  // boundary, and adding a duration lands on the wrong date twice a year.
  const tomorrow = addUtcDays(nowLocalDate, 1);
  if (!tomorrow) return { send: false, sessionId: id, reason: "timezone_unknown" };

  if (sessionLocalDate !== tomorrow) {
    return { send: false, sessionId: id, reason: "not_tomorrow" };
  }

  return { send: true, sessionId: id, localDate: sessionLocalDate, timeZone };
}

/**
 * The window the sweep should QUERY, in instants.
 *
 * Deliberately wider than "tomorrow": zones run from UTC-12 to UTC+14, so a
 * date that is tomorrow *somewhere* spans more than 24 hours of instants. The
 * query is a coarse prefilter and `decideSessionReminder` is the actual test —
 * narrowing the query to exactly 24 hours would silently drop the venues
 * furthest from UTC, which is the failure mode this file is named after.
 */
export function reminderQueryWindow(now: Date = new Date()): {
  fromIso: string;
  toIso: string;
} {
  return {
    fromIso: new Date(now.getTime() - 2 * 86_400_000).toISOString(),
    toIso: new Date(now.getTime() + 3 * 86_400_000).toISOString(),
  };
}
