/**
 * The one place the platform decides what time it is for a workspace.
 *
 * PURE half. `pickTimezone` takes the candidates and returns the winner; the
 * database half lives in `venues.ts` and does nothing but fetch them.
 *
 * THE LADDER, and why it is in this order
 *   1. the venue in play        an event happens AT a place; the place's clock wins
 *   2. the workspace default    `agencies.timezone`, inherited by new venues
 *   3. the appointments setting `settings.appointments.timezone`, the legacy
 *                               store, still written by the appointments UI.
 *                               Read, never written by this module. It leaves
 *                               when that UI writes the column instead.
 *   4. "UTC"                    the honest last resort
 *
 * Anything that does not parse as an IANA zone is skipped rather than trusted,
 * so a bad row degrades one rung instead of throwing at render time.
 */

import { isValidIanaTimeZone } from "@/lib/scheduling/tz";

export const PLATFORM_FALLBACK_TIMEZONE = "UTC";

export type TimezoneSource = "venue" | "workspace" | "appointments_setting" | "platform";

export type TimezoneCandidates = {
  /** `venues.timezone` for the venue in play, when there is one. */
  venue?: string | null;
  /** `agencies.timezone`. */
  workspace?: string | null;
  /** Legacy `settings.appointments.timezone`. Read only. */
  appointmentsSetting?: string | null;
};

export type ResolvedTimezone = {
  timezone: string;
  source: TimezoneSource;
};

/**
 * Pick the timezone for a workspace, optionally at a venue.
 *
 * Returns the source as well as the zone because the settings screen has to be
 * able to say "inherited from the workspace" rather than showing a value the
 * user cannot find anywhere.
 */
export function pickTimezone(candidates: TimezoneCandidates): ResolvedTimezone {
  const ladder: ReadonlyArray<[TimezoneSource, string | null | undefined]> = [
    ["venue", candidates.venue],
    ["workspace", candidates.workspace],
    ["appointments_setting", candidates.appointmentsSetting],
  ];

  for (const [source, value] of ladder) {
    if (typeof value !== "string") continue;
    const trimmed = value.trim();
    if (!trimmed) continue;
    if (!isValidIanaTimeZone(trimmed)) continue;
    return { timezone: trimmed, source };
  }

  return { timezone: PLATFORM_FALLBACK_TIMEZONE, source: "platform" };
}

/**
 * The local hour (0..23) at `instant` in `timeZone`.
 *
 * Returns null for an unusable zone rather than silently answering in UTC,
 * because the caller of this is a cron deciding whether to send mail and
 * "pretend it is UTC" is the bug this module exists to end.
 */
export function localHourIn(instant: Date, timeZone: string): number | null {
  if (!isValidIanaTimeZone(timeZone) || Number.isNaN(instant.getTime())) return null;
  const raw = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    hour: "2-digit",
  }).format(instant);
  const hour = Number(raw);
  return Number.isInteger(hour) && hour >= 0 && hour <= 23 ? hour : null;
}
