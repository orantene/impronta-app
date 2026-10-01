/**
 * Cron — data retention (lib/account/retention.ts).
 *
 * Anonymizes guest contact data on inquiries idle 12 months and deletes
 * unbooked inquiries (with their messages) idle 24 months. Bookings and
 * payment records are never touched. DRY RUN unless RETENTION_ENFORCE is
 * exactly "true": the default run only logs the counts it would act on.
 * MEDIA_REAPER_ENABLED (deleted media, 30 days) is a separate switch and is
 * not read or changed here.
 */

import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError } from "@/lib/server/safe-error";
import { improntaLog } from "@/lib/server/structured-log";
import { runRetention } from "@/lib/account/retention";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    logServerError("cron/enforce-retention", "CRON_SECRET not set; refusing to run");
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

  const report = await runRetention(admin);
  for (const err of report.errors) logServerError("cron/enforce-retention", err);

  await improntaLog("cron.enforce-retention", {
    enforce: report.enforce,
    guestCutoff: report.guestContact.cutoff,
    guestMatched: report.guestContact.matched,
    guestAnonymized: report.guestContact.anonymized,
    purgeCutoff: report.unbookedInquiries.cutoff,
    purgeScanned: report.unbookedInquiries.scanned,
    purgePurgeable: report.unbookedInquiries.purgeable,
    purgeDeleted: report.unbookedInquiries.deleted,
    purgeKept: report.unbookedInquiries.kept,
    errors: report.errors.length,
  });

  return NextResponse.json({ ok: report.errors.length === 0, ...report });
}
