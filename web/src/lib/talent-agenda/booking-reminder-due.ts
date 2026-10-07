/**
 * Which talent-site appointments are due a day-of reminder on this cron run.
 *
 * PURE. No database, no clock of its own (TUL-108). `talent_bookings` is where
 * a guest's appointment on a talent site lives; the agency sweep only reads
 * `agency_bookings`, so these were never reminded.
 *
 * Each booking is judged in its TALENT's own timezone: due when it is 8am there
 * right now AND the booking falls on that zone's local tomorrow. A talent with
 * no usable stored zone falls back to the workspace's zone, then UTC, and each
 * fallback is COUNTED so a silently misconfigured talent shows up in the cron
 * summary instead of being reminded at a wrong hour unnoticed.
 */

import { addUtcDays, isValidIanaTimeZone, utcToZonedYmd } from "@/lib/scheduling/tz";
import { REMINDER_LOCAL_HOUR } from "@/lib/spaces/reminder-schedule";
import { localHourIn } from "@/lib/spaces/venue-timezone";

/** Same live set the agency sweep reminds about. */
export const TALENT_BOOKING_REMINDABLE_STATUSES = ["confirmed", "tentative", "in_progress"] as const;

export type TalentBookingReminderRow = {
  id: string;
  tenant_id: string;
  talent_profile_id: string;
  inquiry_id: string | null;
  starts_at: string | null;
  status: string;
};

export type TalentBookingZoneSource = "talent" | "workspace" | "utc";

export type TalentBookingReminderDecision = {
  /** Bookings to dispatch a reminder for now. */
  due: TalentBookingReminderRow[];
  /** Candidates the sweep looked at. */
  scanned: number;
  skippedNoInquiry: number;
  skippedStatus: number;
  /** Rows with a missing or unparseable `starts_at`. */
  skippedNoStart: number;
  /** Of the DUE rows, how the zone was found. */
  dueByZoneSource: Record<TalentBookingZoneSource, number>;
};

function validZone(zone: string | null | undefined): string | null {
  if (typeof zone !== "string") return null;
  const trimmed = zone.trim();
  return trimmed && isValidIanaTimeZone(trimmed) ? trimmed : null;
}

/** The talent's zone, else their workspace's, else UTC, with which one won. */
export function zoneForTalentBooking(
  row: Pick<TalentBookingReminderRow, "talent_profile_id" | "tenant_id">,
  talentZones: ReadonlyMap<string, string | null>,
  tenantZones: ReadonlyMap<string, string | null>,
): { timezone: string; source: TalentBookingZoneSource } {
  const talent = validZone(talentZones.get(row.talent_profile_id));
  if (talent) return { timezone: talent, source: "talent" };
  const workspace = validZone(tenantZones.get(row.tenant_id));
  if (workspace) return { timezone: workspace, source: "workspace" };
  return { timezone: "UTC", source: "utc" };
}

export function decideTalentBookingReminders(input: {
  now: Date;
  rows: readonly TalentBookingReminderRow[];
  talentZones: ReadonlyMap<string, string | null>;
  tenantZones: ReadonlyMap<string, string | null>;
  hour?: number;
}): TalentBookingReminderDecision {
  const hour = input.hour ?? REMINDER_LOCAL_HOUR;
  const out: TalentBookingReminderDecision = {
    due: [],
    scanned: input.rows.length,
    skippedNoInquiry: 0,
    skippedStatus: 0,
    skippedNoStart: 0,
    dueByZoneSource: { talent: 0, workspace: 0, utc: 0 },
  };

  for (const row of input.rows) {
    if (!row.inquiry_id) {
      out.skippedNoInquiry += 1;
      continue;
    }
    if (!(TALENT_BOOKING_REMINDABLE_STATUSES as readonly string[]).includes(row.status)) {
      out.skippedStatus += 1;
      continue;
    }
    const start = row.starts_at ? new Date(row.starts_at) : null;
    if (!start || Number.isNaN(start.getTime())) {
      out.skippedNoStart += 1;
      continue;
    }

    const { timezone, source } = zoneForTalentBooking(row, input.talentZones, input.tenantZones);
    if (localHourIn(input.now, timezone) !== hour) continue;
    const today = utcToZonedYmd(input.now, timezone);
    const tomorrow = today ? addUtcDays(today, 1) : null;
    if (!tomorrow || utcToZonedYmd(start, timezone) !== tomorrow) continue;

    out.due.push(row);
    out.dueByZoneSource[source] += 1;
  }
  return out;
}

/**
 * The UTC window the loader needs: any zone's local "tomorrow" lies within the
 * next 48 hours of `now`, so rows outside it can never be due on this run.
 */
export function talentReminderCandidateWindow(now: Date): { startIso: string; endIso: string } {
  return {
    startIso: now.toISOString(),
    endIso: new Date(now.getTime() + 48 * 3_600_000).toISOString(),
  };
}
