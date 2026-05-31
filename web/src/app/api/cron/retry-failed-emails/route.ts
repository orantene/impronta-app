/**
 * Cron — failed-email retry sweep (spec §11 / Phase 9).
 *
 * Endpoint: GET /api/cron/retry-failed-emails  (CRON_SECRET bearer auth)
 *
 * Re-runs the email channel handler for `status = 'failed'` dispatch_log rows
 * that failed within the last 24 h (transient Resend / network errors). A
 * recovered send flips the row back to `sent`; suppressed addresses are flipped
 * to `suppressed` and skipped. See `@/lib/notifications/retry`.
 *
 * Scheduled hourly in `web/vercel.json` — at most ~24 attempts before a row
 * ages out of the retry window (there is no per-row attempts column).
 *
 *   curl -H "Authorization: Bearer $CRON_SECRET" \
 *        http://localhost:3000/api/cron/retry-failed-emails
 */

import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError } from "@/lib/server/safe-error";
import { improntaLog } from "@/lib/server/structured-log";
import { retryFailedEmails } from "@/lib/notifications/retry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    logServerError("cron/retry-failed-emails", "CRON_SECRET not set; refusing to run");
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
    const result = await retryFailedEmails(admin);
    void improntaLog("notif.cron.retry", { ...result });
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    logServerError("cron/retry-failed-emails", err);
    return NextResponse.json({ ok: false, error: "Internal error" }, { status: 500 });
  }
}
