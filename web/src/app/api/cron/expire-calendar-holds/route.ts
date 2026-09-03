/**
 * Cron — expire calendar holds (Appointments P1).
 *
 * Endpoint: GET /api/cron/expire-calendar-holds  (CRON_SECRET bearer auth)
 *
 * Two reapers, one schedule.
 *
 * 1. talent_holds. Deletes holds whose expires_at has passed. Required for
 *    CORRECTNESS: the firm-hold gist exclusion constraint cannot see
 *    expires_at, so a lapsed firm hold deadlocks the slot until someone
 *    deletes it by hand. The BEFORE INSERT trigger on talent_holds is the
 *    lazy half of the same reaper.
 *
 * 2. capacity_allocations (Sell the Room 0.2). Marks lapsed holds released.
 *    HYGIENE ONLY: the remaining-units rule already ignores an expired hold,
 *    so a late sweep costs table size and never a wrong answer. The lazy half
 *    runs inside the pool lock at the top of every reserve.
 *
 * Idempotent. Scheduled every minute in web/vercel.json — raised from five
 * because a ticket pool's TTL is ten minutes, and a sweep five minutes coarse
 * against a ten-minute hold leaves half a window of stale rows in the table.
 *
 *   curl -H "Authorization: Bearer $CRON_SECRET" \
 *        http://localhost:3000/api/cron/expire-calendar-holds
 */

import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError } from "@/lib/server/safe-error";
import { improntaLog } from "@/lib/server/structured-log";
import { emitStandardEngineEvent, ENGINE_EVENT_TYPES } from "@/lib/inquiry/inquiry-events";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    logServerError("cron/expire-calendar-holds", "CRON_SECRET not set; refusing to run");
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
    const nowIso = new Date().toISOString();
    const soonIso = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();
    const { data: expiring } = await admin
      .from("talent_holds")
      .select("id, inquiry_id, starts_at")
      .eq("hold_strength", "firm")
      .not("inquiry_id", "is", null)
      .not("expires_at", "is", null)
      .gt("expires_at", nowIso)
      .lte("expires_at", soonIso)
      .limit(200);
    for (const row of (expiring ?? []) as Array<{
      id: string;
      inquiry_id: string;
      starts_at: string;
    }>) {
      await emitStandardEngineEvent(admin, {
        type: ENGINE_EVENT_TYPES.RESERVATION_HOLD_EXPIRING,
        inquiryId: row.inquiry_id,
        actorUserId: null,
        eventId: `hold-expiring:${row.id}`,
        data: { startsAt: row.starts_at, holdId: row.id },
      });
    }

    const { data, error } = await admin
      .from("talent_holds")
      .delete()
      .not("expires_at", "is", null)
      .lt("expires_at", nowIso)
      .select("id");

    if (error) {
      logServerError("cron/expire-calendar-holds", error);
      return NextResponse.json({ ok: false, error: "Internal error" }, { status: 500 });
    }

    const deleted = (data ?? []).length;

    // Capacity allocations. Best-effort and deliberately AFTER the talent_holds
    // delete: that one is a correctness guarantee, this one is housekeeping, so
    // a failure here must never cost us the sweep above.
    let allocationsReleased = 0;
    const { data: reaped, error: reapErr } = await admin.rpc("reap_capacity_allocations", {
      p_limit: 500,
    });
    if (reapErr) {
      logServerError("cron/expire-calendar-holds/capacity", reapErr);
    } else {
      allocationsReleased = typeof reaped === "number" ? reaped : 0;
    }

    void improntaLog("calendar.cron.expire_holds", { deleted, allocationsReleased });
    return NextResponse.json({ ok: true, deleted, allocationsReleased });
  } catch (err) {
    logServerError("cron/expire-calendar-holds", err);
    return NextResponse.json({ ok: false, error: "Internal error" }, { status: 500 });
  }
}
