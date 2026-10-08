/**
 * Cron — data retention (lib/account/retention.ts). Periods come from
 * lib/legal/retention-config.ts (RETENTION_PERIODS).
 *
 *  1. Guest contact data on inquiries idle 3 years is anonymized.
 *  2. Unbooked inquiries (with their messages) idle 3 years are deleted.
 *  3. Anonymised accounts (retention-account-purge.ts): the orphaned, scrubbed
 *     talent profile of a COMPLETED account deletion is hard-deleted 30 days
 *     after the deletion ran (which is after the 14-day grace), but only when
 *     no booking, payout, order, ledger, subscription or media row still
 *     references it.
 *  4. analytics_events and notification_dispatch_log rows older than 90 days
 *     are deleted in bounded batches (retention-log-trims.ts).
 *
 * BOOKINGS AND PAYMENT RECORDS ARE NEVER PURGED BY THIS JOB, pending the legal
 * answer on tax record retention (TUL-43). workspace_audit_events has its own
 * job (workspace-audit-trim, 180 days) and is not touched here.
 *
 * DRY RUN unless RETENTION_ENFORCE is exactly "true": the default run only
 * logs the counts it would act on, for every step above. MEDIA_REAPER_ENABLED
 * (deleted media, 30 days) is a separate switch and is not read or changed here.
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
    accountsCutoff: report.deletedAccounts.cutoff,
    accountsCandidates: report.deletedAccounts.candidates,
    accountsScanned: report.deletedAccounts.scanned,
    accountsPurgeable: report.deletedAccounts.purgeable,
    accountsDeleted: report.deletedAccounts.deleted,
    accountsKept: report.deletedAccounts.kept,
    accountsKeptByReason: JSON.stringify(report.deletedAccounts.keptByReason),
    logsCutoff: report.analyticsEvents.cutoff,
    analyticsOlderThan90d: report.analyticsEvents.olderThanCutoff,
    analyticsDeleted: report.analyticsEvents.deleted,
    dispatchLogOlderThan90d: report.notificationDispatchLog.olderThanCutoff,
    dispatchLogDeleted: report.notificationDispatchLog.deleted,
    errors: report.errors.length,
  });

  return NextResponse.json({ ok: report.errors.length === 0, ...report });
}
