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
    // supabase-read-unchecked-ok: expiring-soon emit is best-effort hygiene —
    // a failed select and an empty select both mean "no holds to notify".
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

    // T1.5: if a firm hold expires while a checkout is still pending, extend it
    // once by ten minutes instead of deleting it immediately.
    const { data: expiredCandidates, error: expiredErr } = await admin
      .from("talent_holds")
      .select("id, inquiry_id, expires_at, created_at")
      .eq("hold_strength", "firm")
      .not("expires_at", "is", null)
      .lt("expires_at", nowIso)
      .limit(100);
    if (expiredErr) {
      logServerError("cron/expire-calendar-holds/candidates", expiredErr);
      return NextResponse.json({ ok: false, error: "Internal error" }, { status: 500 });
    }

    let extended = 0;
    const toDelete: string[] = [];
    for (const hold of (expiredCandidates ?? []) as Array<{
      id: string;
      inquiry_id: string | null;
      expires_at: string;
      created_at: string;
    }>) {
      const createdMs = Date.parse(hold.created_at);
      const expiresMs = Date.parse(hold.expires_at);
      const alreadyExtended =
        Number.isFinite(createdMs) &&
        Number.isFinite(expiresMs) &&
        expiresMs - createdMs > 10 * 60_000 + 5_000;
      let pendingPay = false;
      if (hold.inquiry_id && !alreadyExtended) {
        // supabase-read-unchecked-ok: missing booking and a failed read both
        // mean "do not extend" — the hold is deleted on the else branch.
        const { data: booking } = await admin
          .from("agency_bookings")
          .select("id, payment_status")
          .eq("source_inquiry_id", hold.inquiry_id)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (booking?.id && booking.payment_status !== "paid" && booking.payment_status !== "refunded") {
          // supabase-read-unchecked-ok: missing tx and a failed read both mean
          // no pending checkout — delete the hold rather than extend it.
          const { data: tx } = await admin
            .from("booking_transactions")
            .select("id")
            .eq("booking_id", booking.id)
            .in("status", ["payment_requested", "pending", "processing"])
            .limit(1)
            .maybeSingle();
          pendingPay = Boolean(tx?.id);
        }
      }
      if (pendingPay && !alreadyExtended) {
        const baseMs = Math.max(Date.now(), Date.parse(hold.expires_at));
        const next = new Date(baseMs + 10 * 60_000).toISOString();
        const { error: extErr } = await admin
          .from("talent_holds")
          .update({ expires_at: next })
          .eq("id", hold.id);
        if (!extErr) extended += 1;
        else toDelete.push(hold.id);
      } else {
        toDelete.push(hold.id);
      }
    }

    let deleted = 0;
    if (toDelete.length > 0) {
      const { data, error } = await admin
        .from("talent_holds")
        .delete()
        .in("id", toDelete)
        .select("id");
      if (error) {
        logServerError("cron/expire-calendar-holds", error);
        return NextResponse.json({ ok: false, error: "Internal error" }, { status: 500 });
      }
      deleted = (data ?? []).length;
    }

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

    void improntaLog("calendar.cron.expire_holds", { deleted, extended, allocationsReleased });
    return NextResponse.json({ ok: true, deleted, extended, allocationsReleased });
  } catch (err) {
    logServerError("cron/expire-calendar-holds", err);
    return NextResponse.json({ ok: false, error: "Internal error" }, { status: 500 });
  }
}
