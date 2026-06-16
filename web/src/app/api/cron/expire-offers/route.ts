/**
 * Cron — stale-offer expiry sweep (WS-A2 A5).
 *
 * Endpoint: GET /api/cron/expire-offers  (CRON_SECRET bearer auth)
 *
 * Flips every still-open offer whose validity window has lapsed from `sent` to
 * `expired`:
 *
 *   inquiry_offers SET status = 'expired'
 *   WHERE status = 'sent' AND valid_until IS NOT NULL AND valid_until < now()
 *
 * This frees the one-active-offer slot (so the coordinator can re-issue) and
 * keeps the accept-time guard in `submitApproval` honest — a client/talent can
 * never accept a quote the agency let lapse. Idempotent: a row that already
 * moved out of `sent` is untouched on the next sweep.
 *
 * Scheduled hourly in `web/vercel.json`. The `valid_until < now()` filter is
 * evaluated against the DB clock via the service-role client.
 *
 *   curl -H "Authorization: Bearer $CRON_SECRET" \
 *        http://localhost:3000/api/cron/expire-offers
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
    logServerError("cron/expire-offers", "CRON_SECRET not set; refusing to run");
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
      .from("inquiry_offers")
      .update({ status: "expired" as never })
      .eq("status", "sent")
      .not("valid_until", "is", null)
      .lt("valid_until", nowIso)
      .select("id");

    if (error) {
      logServerError("cron/expire-offers", error);
      return NextResponse.json({ ok: false, error: "Internal error" }, { status: 500 });
    }

    const expired = (data ?? []).length;
    void improntaLog("inquiry.cron.expire_offers", { expired });
    return NextResponse.json({ ok: true, expired });
  } catch (err) {
    logServerError("cron/expire-offers", err);
    return NextResponse.json({ ok: false, error: "Internal error" }, { status: 500 });
  }
}
