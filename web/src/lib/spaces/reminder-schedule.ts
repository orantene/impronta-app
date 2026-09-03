/**
 * Which workspaces are due a daily sweep right now, in their own time.
 *
 * PURE. No database, no clock of its own: the caller passes `now` and the
 * tenant list, which is what makes the whole thing testable without waiting
 * twenty-four hours to see whether Cancun got its mail.
 *
 * THE PROBLEM THIS SOLVES
 * The day-of reminder cron ran once a day at 08:00 UTC and asked "is this
 * booking tomorrow?" against the UTC calendar. For a workspace in Tulum that is
 * 03:00 local, and "tomorrow" flipped over five hours before the guest's day
 * did. Every workspace in production is on UTC today, so nobody has complained;
 * that is not the same as it being right.
 *
 * THE SHAPE
 * The cron runs hourly. Each run asks each workspace "is it 8am where you are?"
 * and sweeps only those. A workspace is therefore swept exactly once per day,
 * on its own morning. Zones at :30 and :45 offsets (India, Nepal, Chatham) land
 * on the hour tick that contains their 8am, which is the correct behaviour for
 * an hourly cron and the reason the gate is on the hour and not on a minute.
 *
 * Idempotency is not this module's job and does not depend on it: the producer
 * uses a stable `booking-reminder:<bookingId>` eventId and
 * `notification_dispatch_log_dedupe_uq` is a unique index on the dedupe key, so
 * a second sweep of the same booking is a no-op at the database level.
 */

import { addUtcDays, utcToZonedYmd, zonedLocalToUtc } from "@/lib/scheduling/tz";
import { localHourIn } from "./venue-timezone";

/** The local hour at which a workspace gets its day-of reminders. */
export const REMINDER_LOCAL_HOUR = 8;

export type TenantClock = {
  tenantId: string;
  timezone: string;
};

export type TenantSweep = {
  tenantId: string;
  timezone: string;
  /** The local civil date being reminded about: local today plus one. */
  tomorrowYmd: string;
  /** The day after it, for a half-open [tomorrow, dayAfter) date comparison. */
  dayAfterYmd: string;
  /** UTC instant of local midnight starting `tomorrowYmd`. */
  windowStart: Date;
  /** UTC instant of local midnight ending it. */
  windowEnd: Date;
};

/**
 * The workspaces whose local hour is `hour` at `now`, with the local day they
 * should be reminding about and the UTC window that day occupies.
 *
 * A workspace whose timezone does not parse, or whose local midnight cannot be
 * mapped to an instant, is dropped rather than swept in UTC by accident. It is
 * better for a reminder to be visibly missing than to be silently sent at the
 * wrong time to the wrong day's guests.
 */
export function tenantsDueForSweep(
  now: Date,
  tenants: readonly TenantClock[],
  hour: number = REMINDER_LOCAL_HOUR,
): TenantSweep[] {
  const due: TenantSweep[] = [];
  for (const tenant of tenants) {
    if (localHourIn(now, tenant.timezone) !== hour) continue;

    const todayYmd = utcToZonedYmd(now, tenant.timezone);
    if (!todayYmd) continue;
    const tomorrowYmd = addUtcDays(todayYmd, 1);
    const dayAfterYmd = tomorrowYmd ? addUtcDays(tomorrowYmd, 1) : null;
    if (!tomorrowYmd || !dayAfterYmd) continue;

    const windowStart = zonedLocalToUtc(tomorrowYmd, 0, tenant.timezone);
    const windowEnd = zonedLocalToUtc(dayAfterYmd, 0, tenant.timezone);
    if (!windowStart || !windowEnd) continue;

    due.push({
      tenantId: tenant.tenantId,
      timezone: tenant.timezone,
      tomorrowYmd,
      dayAfterYmd,
      windowStart,
      windowEnd,
    });
  }
  return due;
}

/**
 * Is this booking on `tomorrowYmd` in `timeZone`?
 *
 * The zone-aware sibling of `bookingIsRemindableTomorrow`, which slices the
 * first ten characters off the ISO string and therefore always answers in UTC.
 * That function stays as it is: it is still correct for a UTC workspace, and
 * changing it would change the meaning of the tests that pin it.
 *
 * `starts_at` is an instant and is converted. `event_date` is a bare civil date
 * with no zone attached, so it is compared as written; converting it would be
 * inventing a time that nobody recorded.
 */
export function bookingIsOnLocalDay(
  row: { starts_at?: string | null; event_date?: string | null },
  tomorrowYmd: string,
  timeZone: string,
): boolean {
  if (typeof row.starts_at === "string" && row.starts_at.trim()) {
    const instant = new Date(row.starts_at);
    if (Number.isNaN(instant.getTime())) return false;
    return utcToZonedYmd(instant, timeZone) === tomorrowYmd;
  }
  if (typeof row.event_date === "string" && row.event_date.trim()) {
    return row.event_date.slice(0, 10) === tomorrowYmd;
  }
  return false;
}
