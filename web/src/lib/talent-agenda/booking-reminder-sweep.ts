import "server-only";

import type { createServiceRoleClient } from "@/lib/supabase/admin";
import { notifyTalentBookingDayOfReminder } from "@/lib/notifications/producers/booking-day-of-reminder-notify";
import type { DispatchResult } from "@/lib/notifications/types";
import { logServerError } from "@/lib/server/safe-error";
import { loadTalentTradeSlugs } from "./talent-trade-slugs";
import {
  TALENT_BOOKING_REMINDABLE_STATUSES,
  decideTalentBookingReminders,
  talentReminderCandidateWindow,
  type TalentBookingReminderRow,
} from "./booking-reminder-due";

type Admin = NonNullable<ReturnType<typeof createServiceRoleClient>>;

/** Safety cap on one run's candidate rows (48h of live appointments). */
const CANDIDATE_LIMIT = 5000;

export type TalentBookingSweepSummary = {
  talentBookingsScanned: number;
  talentBookingsReminded: number;
  talentBookingsSkippedNoInquiry: number;
  talentBookingsSkippedStatus: number;
  talentBookingsSkippedNoStart: number;
  /** Due bookings whose zone came from the talent's own saved timezone. */
  talentBookingsZoneTalent: number;
  /** Due bookings that fell back to the workspace zone (talent has none saved). */
  talentBookingsZoneWorkspaceFallback: number;
  /** Due bookings that fell back to UTC (neither talent nor workspace zone). */
  talentBookingsZoneUtcFallback: number;
  talentBookingsQueryError: string | null;
};

export function emptyTalentBookingSweepSummary(): TalentBookingSweepSummary {
  return {
    talentBookingsScanned: 0,
    talentBookingsReminded: 0,
    talentBookingsSkippedNoInquiry: 0,
    talentBookingsSkippedStatus: 0,
    talentBookingsSkippedNoStart: 0,
    talentBookingsZoneTalent: 0,
    talentBookingsZoneWorkspaceFallback: 0,
    talentBookingsZoneUtcFallback: 0,
    talentBookingsQueryError: null,
  };
}

/**
 * Sweep `talent_bookings` for appointments that are tomorrow in their talent's
 * own morning. Never throws: a failed query is reported in the summary so the
 * agency sweep's result is unaffected. Idempotent through the producer's stable
 * `talent-booking-reminder:<id>` eventId.
 */
export async function sweepTalentBookingReminders(
  admin: Admin,
  now: Date,
  tenantZones: ReadonlyMap<string, string | null>,
): Promise<{ summary: TalentBookingSweepSummary; totals: DispatchResult }> {
  const summary = emptyTalentBookingSweepSummary();
  const totals: DispatchResult = { dispatched: 0, suppressed: 0, failed: 0, queued: 0 };

  const { startIso, endIso } = talentReminderCandidateWindow(now);
  const { data, error } = await admin
    .from("talent_bookings")
    .select("id, tenant_id, talent_profile_id, inquiry_id, starts_at, status, title, location_text")
    .in("status", TALENT_BOOKING_REMINDABLE_STATUSES)
    .not("inquiry_id", "is", null)
    .gte("starts_at", startIso)
    .lt("starts_at", endIso)
    .limit(CANDIDATE_LIMIT);
  if (error) {
    logServerError("cron/booking-reminders.talent-query", error.message);
    summary.talentBookingsQueryError = error.message;
    totals.failed += 1;
    return { summary, totals };
  }
  const rows = (data ?? []) as TalentBookingReminderRow[];
  if (rows.length === 0) return { summary, totals };

  const profileIds = Array.from(new Set(rows.map((r) => r.talent_profile_id)));
  const { data: hoursRows, error: hoursErr } = await admin
    .from("talent_booking_hours")
    .select("talent_profile_id, timezone")
    .in("talent_profile_id", profileIds);
  if (hoursErr) {
    // Without the talents' zones every row would silently be judged in the
    // workspace's zone. Refuse the run instead; the next hour retries.
    logServerError("cron/booking-reminders.talent-hours", hoursErr.message);
    summary.talentBookingsQueryError = hoursErr.message;
    summary.talentBookingsScanned = rows.length;
    totals.failed += 1;
    return { summary, totals };
  }
  const talentZones = new Map<string, string | null>();
  for (const h of (hoursRows ?? []) as Array<{ talent_profile_id: string; timezone: string | null }>) {
    talentZones.set(h.talent_profile_id, h.timezone);
  }

  // TUL-259: trade slugs pick appointment vs event wording. A failed read
  // degrades to the source-based default (appointment); it never blocks reminders.
  const tradeSlugs = await loadTalentTradeSlugs(admin, profileIds);

  const decision = decideTalentBookingReminders({ now, rows, talentZones, tenantZones });
  summary.talentBookingsScanned = decision.scanned;
  summary.talentBookingsReminded = decision.due.length;
  summary.talentBookingsSkippedNoInquiry = decision.skippedNoInquiry;
  summary.talentBookingsSkippedStatus = decision.skippedStatus;
  summary.talentBookingsSkippedNoStart = decision.skippedNoStart;
  summary.talentBookingsZoneTalent = decision.dueByZoneSource.talent;
  summary.talentBookingsZoneWorkspaceFallback = decision.dueByZoneSource.workspace;
  summary.talentBookingsZoneUtcFallback = decision.dueByZoneSource.utc;

  const results = await Promise.allSettled(
    decision.due.map((r) =>
      notifyTalentBookingDayOfReminder({
        tenantId: r.tenant_id,
        inquiryId: r.inquiry_id as string,
        talentBookingId: r.id,
        startsAt: r.starts_at as string,
        timezone: r.timezone,
        title: r.title ?? null,
        location: r.location_text ?? null,
        tradeSlugs: tradeSlugs.get(r.talent_profile_id),
      }),
    ),
  );
  for (const res of results) {
    if (res.status === "fulfilled") {
      totals.dispatched += res.value.dispatched;
      totals.suppressed += res.value.suppressed;
      totals.failed += res.value.failed;
      totals.queued += res.value.queued;
    } else {
      totals.failed += 1;
      logServerError("cron/booking-reminders.talent-dispatch", res.reason);
    }
  }
  return { summary, totals };
}
