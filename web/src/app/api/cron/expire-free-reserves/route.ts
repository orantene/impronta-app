/**
 * Cron — free-reserve expiry sweep (Talent Services Lane B).
 *
 * Endpoint: GET /api/cron/expire-free-reserves  (CRON_SECRET bearer auth)
 *
 * Auto-releases free-reserve bookings whose hold window has lapsed: cancels the
 * booking, voids its draft transaction, returns any reserved product unit to
 * stock, and emits the same audit event + notifications a manual cancel would.
 * See ./logic.ts for the sweep. Idempotent; scheduled daily in web/vercel.json.
 *
 *   curl -H "Authorization: Bearer $CRON_SECRET" \
 *        http://localhost:3000/api/cron/expire-free-reserves
 */

import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError } from "@/lib/server/safe-error";
import { improntaLog } from "@/lib/server/structured-log";
import { sweepExpiredFreeReserves } from "./logic";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    logServerError("cron/expire-free-reserves", "CRON_SECRET not set; refusing to run");
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
    const result = await sweepExpiredFreeReserves(admin);
    void improntaLog("inquiry.cron.expire_free_reserves", {
      scanned: result.scanned,
      cancelled: result.cancelled,
      ids: result.ids.join(","),
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    logServerError("cron/expire-free-reserves", err);
    return NextResponse.json({ ok: false, error: "Internal error" }, { status: 500 });
  }
}
