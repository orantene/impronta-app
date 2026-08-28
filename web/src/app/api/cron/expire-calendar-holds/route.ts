/**
 * Cron — expire calendar holds (Appointments P1).
 *
 * Endpoint: GET /api/cron/expire-calendar-holds  (CRON_SECRET bearer auth)
 *
 * Deletes talent_holds whose expires_at has passed. Required because the
 * firm-hold gist exclusion constraint cannot see expires_at: a lapsed firm
 * hold would otherwise deadlock the slot until someone deleted it by hand.
 * Idempotent. Scheduled every 5 minutes in web/vercel.json. The BEFORE INSERT
 * trigger on talent_holds is the lazy half of the same reaper.
 *
 *   curl -H "Authorization: Bearer $CRON_SECRET" \
 *        http://localhost:3000/api/cron/expire-calendar-holds
 */

import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError } from "@/lib/server/safe-error";
import { improntaLog } from "@/lib/server/structured-log";

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
    void improntaLog("calendar.cron.expire_holds", { deleted });
    return NextResponse.json({ ok: true, deleted });
  } catch (err) {
    logServerError("cron/expire-calendar-holds", err);
    return NextResponse.json({ ok: false, error: "Internal error" }, { status: 500 });
  }
}
