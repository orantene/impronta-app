/**
 * Cron — day-of booking reminder sweep (spec §6.4 / Slice 15.6).
 *
 * Endpoint: GET /api/cron/booking-reminders  (CRON_SECRET bearer auth)
 *
 * RUNS HOURLY, SWEEPS EACH WORKSPACE ONCE, IN ITS OWN MORNING
 * It used to run once a day at 08:00 UTC and ask "is this booking tomorrow?"
 * against the UTC calendar. For a workspace in Tulum that is 03:00 local, and
 * "tomorrow" flipped five hours before the guest's day did. Now it runs every
 * hour, asks each workspace whether it is 8am *there* (Spaces & Seating S1:
 * the venue's timezone, then the workspace's, then UTC), and sweeps only those.
 * A workspace is still reminded exactly once a day.
 *
 * Twenty-four times the runs does NOT mean twenty-four times the mail: the
 * producer's stable `booking-reminder:<bookingId>` eventId plus the partial
 * unique index `notification_dispatch_log_dedupe_uq` collapse a repeat to a
 * no-op in the database, not in application logic.
 *
 * It finds every booking that is tomorrow *in the workspace's own zone* and
 * still live (confirmed / tentative / in_progress) and dispatches
 * `booking.day_of_reminder` for it — the client (or guest contact) and every
 * booked talent each get a "your event is tomorrow" email + in-app bell.
 *
 * Only bookings carrying a `source_inquiry_id` are eligible: the catalog
 * entries hydrate schedule + location via `loadInquiryView` and resolve the
 * talent roster via `allRosterTalent`, both keyed on the inquiry. A booking
 * with no source inquiry is skipped (counted, not errored).
 *
 * Idempotent: the producer's stable `eventId` (`booking-reminder:<bookingId>`)
 * + the dispatch_log unique index collapse a duplicate send to a no-op, so an
 * extra run (or a booking whose date straddles two runs) never double-reminds.
 *
 * Scheduled hourly in `web/vercel.json`. Manual test:
 *   curl -H "Authorization: Bearer $CRON_SECRET" \
 *        http://localhost:3000/api/cron/booking-reminders
 */

import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError } from "@/lib/server/safe-error";
import { improntaLog } from "@/lib/server/structured-log";
import { notifyBookingDayOfReminder } from "@/lib/notifications/producers/booking-day-of-reminder-notify";
import { runReviewRequestReminders } from "@/lib/notifications/producers/review-request-reminder-notify";
import type { DispatchResult } from "@/lib/notifications/types";
import {
  bookingIsOnLocalDay,
  tenantsDueForSweep,
  type TenantSweep,
} from "@/lib/spaces/reminder-schedule";
import { pickTimezone } from "@/lib/spaces/venue-timezone";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Statuses worth reminding — the booking is still going to happen. Excludes
 * draft (not yet live), cancelled / completed / archived (over or void).
 */
const REMINDABLE_STATUSES = ["confirmed", "tentative", "in_progress"] as const;

/** The UTC hour of an instant. The review sweep still runs once a day, at 08:00Z. */
const REVIEW_SWEEP_UTC_HOUR = 8;

type BookingRow = {
  id: string;
  tenant_id: string;
  source_inquiry_id: string | null;
  event_date: string | null;
  starts_at: string | null;
  status: string;
};

/**
 * Every workspace's clock: the default venue's timezone when it has one, the
 * workspace default otherwise, and the legacy appointments setting last. This
 * is the only place this route asks what time it is anywhere.
 */
async function loadTenantClocks(
  admin: ReturnType<typeof createServiceRoleClient>,
): Promise<Array<{ tenantId: string; timezone: string }>> {
  if (!admin) return [];
  const [{ data: agencyRows }, { data: venueRows }] = await Promise.all([
    admin.from("agencies").select("id, timezone, settings"),
    admin.from("venues").select("tenant_id, timezone").eq("is_default", true),
  ]);

  const venueByTenant = new Map<string, string | null>();
  for (const row of (venueRows ?? []) as Array<{ tenant_id: string; timezone: string | null }>) {
    venueByTenant.set(row.tenant_id, row.timezone);
  }

  return ((agencyRows ?? []) as Array<{
    id: string;
    timezone: string | null;
    settings: unknown;
  }>).map((agency) => ({
    tenantId: agency.id,
    timezone: pickTimezone({
      venue: venueByTenant.get(agency.id) ?? null,
      workspace: agency.timezone,
      appointmentsSetting: appointmentsTimezone(agency.settings),
    }).timezone,
  }));
}

function appointmentsTimezone(settings: unknown): string | null {
  if (typeof settings !== "object" || settings === null || Array.isArray(settings)) return null;
  const appointments = (settings as Record<string, unknown>).appointments;
  if (typeof appointments !== "object" || appointments === null || Array.isArray(appointments)) {
    return null;
  }
  const tz = (appointments as Record<string, unknown>).timezone;
  return typeof tz === "string" ? tz : null;
}

/**
 * The live bookings falling on one workspace's local tomorrow.
 *
 * The SQL window is the UTC instants that local day occupies, which is 25 hours
 * long on a fall-back Sunday and 23 on a spring-forward one; `bookingIsOnLocalDay`
 * then decides precisely, because a row carrying only a bare `event_date` has no
 * instant to compare and must be matched as written.
 */
async function bookingsForSweep(
  admin: NonNullable<ReturnType<typeof createServiceRoleClient>>,
  sweep: TenantSweep,
): Promise<{ scanned: BookingRow[]; eligible: BookingRow[]; error: string | null }> {
  const startIso = sweep.windowStart.toISOString();
  const endIso = sweep.windowEnd.toISOString();
  const { data, error } = await admin
    .from("agency_bookings")
    .select("id, tenant_id, source_inquiry_id, event_date, starts_at, status")
    .eq("tenant_id", sweep.tenantId)
    .in("status", REMINDABLE_STATUSES)
    .or(
      `and(starts_at.gte.${startIso},starts_at.lt.${endIso}),` +
        `and(starts_at.is.null,event_date.gte.${sweep.tomorrowYmd},event_date.lt.${sweep.dayAfterYmd})`,
    );

  if (error) return { scanned: [], eligible: [], error: error.message };
  const scanned = (data ?? []) as BookingRow[];
  const eligible = scanned.filter(
    (row) =>
      row.source_inquiry_id && bookingIsOnLocalDay(row, sweep.tomorrowYmd, sweep.timezone),
  );
  return { scanned, eligible, error: null };
}

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    logServerError("cron/booking-reminders", "CRON_SECRET not set; refusing to run");
    return NextResponse.json({ error: "Not configured" }, { status: 503 });
  }

  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token || token !== secret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createServiceRoleClient();
  if (!admin) {
    return NextResponse.json({ error: "Service role unavailable" }, { status: 503 });
  }

  try {
    const now = new Date();
    const clocks = await loadTenantClocks(admin);
    const sweeps = tenantsDueForSweep(now, clocks);

    const totals: DispatchResult = { dispatched: 0, suppressed: 0, failed: 0, queued: 0 };
    let bookingsScanned = 0;
    let bookingsReminded = 0;
    let bookingsSkippedNoInquiry = 0;

    for (const sweep of sweeps) {
      const { scanned, eligible, error } = await bookingsForSweep(admin, sweep);
      if (error) {
        // One workspace's failed query must not silence every other workspace
        // due in the same hour, so this is logged and stepped over rather than
        // returned. The failure is counted in `totals.failed` and logged.
        logServerError("cron/booking-reminders.query", `${sweep.tenantId}: ${error}`);
        totals.failed += 1;
        continue;
      }
      bookingsScanned += scanned.length;
      bookingsReminded += eligible.length;
      bookingsSkippedNoInquiry += scanned.length - eligible.length;

      const results = await Promise.allSettled(
        eligible.map((r) =>
          notifyBookingDayOfReminder({
            tenantId: r.tenant_id,
            inquiryId: r.source_inquiry_id as string,
            bookingId: r.id,
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
          logServerError("cron/booking-reminders.dispatch", res.reason);
        }
      }
    }

    // Piggyback the STANDING review-request reminder sweep on this daily run
    // (no dedicated review cron — see review-request-reminder-notify.ts). It is
    // idempotent (reminded_at cursor + dispatch_log dedupe) and best-effort: a
    // failure here must never fail the booking-reminder sweep above.
    // It is not workspace-scoped and has no venue to be local to, so it stays
    // on exactly the cadence it had: once a day, at 08:00 UTC. Making the
    // enclosing cron hourly must not quietly run it twenty-four times.
    let reviewReminders = { scanned: 0, reminded: 0 };
    const reviewSweepDue = now.getUTCHours() === REVIEW_SWEEP_UTC_HOUR;
    if (reviewSweepDue) {
      try {
        reviewReminders = await runReviewRequestReminders();
      } catch (err) {
        logServerError("cron/booking-reminders.review-reminders", err);
      }
    }

    const summary = {
      ranAt: now.toISOString(),
      tenantsDue: sweeps.length,
      tenantsSwept: sweeps
        .map((s) => `${s.tenantId}@${s.timezone}:${s.tomorrowYmd}`)
        .join(" "),
      bookingsScanned,
      bookingsReminded,
      bookingsSkippedNoInquiry,
      reviewSweepDue,
      reviewRequestsScanned: reviewReminders.scanned,
      reviewRequestsReminded: reviewReminders.reminded,
      ...totals,
    };
    void improntaLog("notif.cron.booking_reminders", summary);
    return NextResponse.json({ ok: true, ...summary });
  } catch (err) {
    logServerError("cron/booking-reminders", err);
    return NextResponse.json({ ok: false, error: "Internal error" }, { status: 500 });
  }
}
