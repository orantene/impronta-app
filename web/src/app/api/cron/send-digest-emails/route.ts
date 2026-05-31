/**
 * Cron — digest email sweep (spec §7 / Phase 9).
 *
 * Endpoint: GET /api/cron/send-digest-emails  (CRON_SECRET bearer auth)
 *
 * Collapses queued `payload.digest = true` dispatch_log rows per
 * `(recipient, category)` into one summary email once the category's batch
 * window has elapsed (messages 30 min, roster_activity 60 min, else daily).
 * See `@/lib/notifications/digest` for the batching logic.
 *
 * Scheduled every 15 min in `web/vercel.json`. Safe to run more often — rows
 * whose window hasn't closed are left queued; flushed rows are marked `sent`
 * so a re-run never double-sends.
 *
 *   curl -H "Authorization: Bearer $CRON_SECRET" \
 *        http://localhost:3000/api/cron/send-digest-emails
 */

import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError } from "@/lib/server/safe-error";
import { improntaLog } from "@/lib/server/structured-log";
import { processQueuedDigests } from "@/lib/notifications/digest";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    logServerError("cron/send-digest-emails", "CRON_SECRET not set; refusing to run");
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
    const result = await processQueuedDigests(admin);
    void improntaLog("notif.cron.digest", { ...result });
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    logServerError("cron/send-digest-emails", err);
    return NextResponse.json({ ok: false, error: "Internal error" }, { status: 500 });
  }
}
