/**
 * Cron: cancel draft / pending_payment orders whose hold or idle fuse has lapsed.
 *
 * Endpoint: GET /api/cron/expire-orders  (CRON_SECRET bearer auth)
 *
 * Capacity's reaper already returns the seat. This moves the ORDER so it does
 * not sit in pending_payment forever.
 */

import { NextResponse } from "next/server";

import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError } from "@/lib/server/safe-error";
import { improntaLog } from "@/lib/server/structured-log";
import { sweepExpiredOrders } from "@/lib/orders/expire-orders";
import { recordCronHeartbeat } from "@/lib/ops/cron-heartbeat";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    logServerError("cron/expire-orders", "CRON_SECRET not set; refusing to run");
    return NextResponse.json({ ok: false, error: "not_configured" }, { status: 503 });
  }
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (token !== secret) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

  const admin = createServiceRoleClient();
  if (!admin) return NextResponse.json({ ok: false, error: "no_service_role" }, { status: 503 });

  try {
    const result = await sweepExpiredOrders(admin);
    void improntaLog("orders.cron.expire_orders", result);
    await recordCronHeartbeat({
      job: "expire-orders",
      ok: true,
      detail: `scanned=${result.scanned} cancelled=${result.cancelled} failed=${result.failed}`,
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    logServerError("cron/expire-orders", err);
    await recordCronHeartbeat({ job: "expire-orders", ok: false, detail: "sweep_failed" });
    return NextResponse.json({ ok: false, error: "sweep_failed" }, { status: 500 });
  }
}
