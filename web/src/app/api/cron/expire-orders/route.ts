/**
 * Cron: cancel draft / pending_payment orders whose hold or idle fuse has lapsed.
 *
 * Endpoint: GET /api/cron/expire-orders  (CRON_SECRET bearer auth)
 *
 * Capacity's reaper already returns the seat. This moves the ORDER so it does
 * not sit in pending_payment forever.
 *
 * It also reaps lapsed COLLECTION RESERVATIONS, and that rides here rather than
 * on a route of its own because it is the same fuse on the same aggregate: a
 * claim on an order's balance that nobody completed is exactly as stranded as
 * the order it was taken against, and a second cron entry is a second thing to
 * forget to schedule. An unreaped reservation is money no till can collect.
 */

import { NextResponse } from "next/server";

import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError } from "@/lib/server/safe-error";
import { improntaLog } from "@/lib/server/structured-log";
import { sweepExpiredOrders } from "@/lib/orders/expire-orders";
import { reapCollectionReservations } from "@/lib/pos/collection-reservations";
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
    const reaped = await reapCollectionReservations(admin);
    const reservationsReleased = reaped.ok ? reaped.released : 0;
    void improntaLog("orders.cron.expire_orders", { ...result, reservationsReleased });
    await recordCronHeartbeat({
      job: "expire-orders",
      ok: true,
      detail:
        `scanned=${result.scanned} cancelled=${result.cancelled} failed=${result.failed} `
        + `reservations_released=${reservationsReleased}`,
    });
    return NextResponse.json({ ok: true, ...result, reservationsReleased });
  } catch (err) {
    logServerError("cron/expire-orders", err);
    await recordCronHeartbeat({ job: "expire-orders", ok: false, detail: "sweep_failed" });
    return NextResponse.json({ ok: false, error: "sweep_failed" }, { status: 500 });
  }
}
