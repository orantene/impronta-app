/**
 * Cron — day-of booking reminder sweep (spec §6.4 / Slice 15.6).
 *
 * Endpoint: GET /api/cron/booking-reminders  (CRON_SECRET bearer auth)
 *
 * Once a day it finds every booking whose `event_date` is tomorrow (UTC) and
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
 * Scheduled daily in `web/vercel.json`. Manual test:
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
import { bookingIsRemindableTomorrow } from "@/lib/scheduling/booking-reminder-window";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Statuses worth reminding — the booking is still going to happen. Excludes
 * draft (not yet live), cancelled / completed / archived (over or void).
 */
const REMINDABLE_STATUSES = ["confirmed", "tentative", "in_progress"] as const;

/** UTC YYYY-MM-DD `daysFromNow` days out (0 = today, 1 = tomorrow). */
function utcDateStr(daysFromNow: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + daysFromNow);
  return d.toISOString().slice(0, 10);
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
    const tomorrow = utcDateStr(1);
    const dayAfter = utcDateStr(2);

    // Half-open [tomorrow, dayAfter) window on `event_date`. ISO strings sort
    // lexicographically, so this captures the date whether it's stored as a
    // bare "2026-06-14" or a full "2026-06-14T10:00:00Z" timestamp.
    const tomorrowStart = `${tomorrow}T00:00:00.000Z`;
    const dayAfterStart = `${dayAfter}T00:00:00.000Z`;
    const { data, error } = await admin
      .from("agency_bookings")
      .select("id, tenant_id, source_inquiry_id, event_date, starts_at, status")
      .in("status", REMINDABLE_STATUSES)
      .or(
        `and(starts_at.gte.${tomorrowStart},starts_at.lt.${dayAfterStart}),and(starts_at.is.null,event_date.gte.${tomorrow},event_date.lt.${dayAfter})`,
      );

    if (error) {
      logServerError("cron/booking-reminders.query", error);
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    const rows = (data ?? []) as Array<{
      id: string;
      tenant_id: string;
      source_inquiry_id: string | null;
      event_date: string | null;
      starts_at: string | null;
      status: string;
    }>;

    // Prefer starts_at when present. Only inquiry-backed bookings hydrate.
    const eligible = rows.filter(
      (r) => r.source_inquiry_id && bookingIsRemindableTomorrow(r, tomorrow, dayAfter),
    );

    const totals: DispatchResult = { dispatched: 0, suppressed: 0, failed: 0, queued: 0 };
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

    // Piggyback the STANDING review-request reminder sweep on this daily run
    // (no dedicated review cron — see review-request-reminder-notify.ts). It is
    // idempotent (reminded_at cursor + dispatch_log dedupe) and best-effort: a
    // failure here must never fail the booking-reminder sweep above.
    let reviewReminders = { scanned: 0, reminded: 0 };
    try {
      reviewReminders = await runReviewRequestReminders();
    } catch (err) {
      logServerError("cron/booking-reminders.review-reminders", err);
    }

    const summary = {
      date: tomorrow,
      bookingsScanned: rows.length,
      bookingsReminded: eligible.length,
      bookingsSkippedNoInquiry: rows.length - eligible.length,
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
