import type { SupabaseClient } from "@supabase/supabase-js";

import { RETENTION_PERIODS } from "@/lib/legal/retention-config";

import { DELETED_USER_LABEL } from "./anonymize";
import { daysBefore, errorMessage, headCount } from "./retention-db";

/**
 * Hard-delete of ANONYMISED accounts, `deletedAccountPurgeDaysAfterGrace` days
 * after the 14-day grace (policy: "deleted accounts purged 30 days after a
 * 14-day grace").
 *
 * WHAT AN EXECUTED DELETION LEAVES BEHIND (lib/account/deletion.ts + anonymize.ts):
 * the auth user is deleted (profiles cascades away, which SET NULLs
 * talent_profiles.user_id), the talent profile row stays scrubbed
 * (display_name = "Deleted user", deleted_at = the run's `now`), media is
 * soft-deleted, and bookings, orders and payment records are kept. So the
 * purge candidate is the orphaned, anonymised `talent_profiles` row.
 *
 * WHICH TIMESTAMP: the executor stamps `account_deletion_requests.completed_at`
 * and `talent_profiles.deleted_at` with the SAME `now` of one cron run, and it
 * runs AFTER the 14-day grace. So completed_at is "grace end" for practical
 * purposes and completed_at + 30 d is "grace + 30 d". The request row has no
 * link to the profile (user_id has no FK and the profile's user_id is NULLed),
 * so a profile is tied to a COMPLETED request by that exact shared timestamp;
 * a profile with no matching completed request is kept.
 *
 * A candidate is purgeable ONLY IF NOTHING FINANCIAL OR BOOKING-RELATED STILL
 * REFERENCES IT (same idea as isPurgeableInquiry). Deleting the profile
 * cascades into ~85 talent-content tables (site, field values, calendar...),
 * all non-financial, and SET NULLs the money/booking links; this job refuses to
 * do either to a financial row, and it keeps the account while any media row
 * remains (the media reaper never removes soft-deleted rows, and a cascade
 * would orphan their storage objects). Guarded tables are listed in
 * ACCOUNT_REFERENCE_GUARDS; a static test fails when a migration adds a table
 * that references talent_profiles and nobody classified it.
 *
 * Dry run: head counts only, nothing written. Bounded per run.
 */

export const ACCOUNT_PURGE_PAGE = 50;
export const MAX_ACCOUNT_PURGE_PAGES = 4;
export const MAX_ACCOUNT_DELETES_PER_RUN = 25;

export type ReferenceGuard = { table: string; column: string; reason: string };

/**
 * Every table that holds a financial, booking, subscription or file reference
 * to a talent profile. Any row here keeps the account.
 */
export const ACCOUNT_REFERENCE_GUARDS: readonly ReferenceGuard[] = [
  { table: "agency_bookings", column: "talent_profile_id", reason: "booking" },
  { table: "booking_talent", column: "talent_profile_id", reason: "booking" },
  { table: "talent_bookings", column: "talent_profile_id", reason: "booking" },
  // No foreign key on this column at all: a delete would leave dangling payout rows.
  { table: "booking_payouts", column: "talent_profile_id", reason: "payout" },
  // Polymorphic owner_id (no FK). Booking transactions reference these as payout receiver.
  { table: "payout_accounts", column: "owner_id", reason: "payout_account" },
  { table: "ledger_entries", column: "talent_profile_id", reason: "money" },
  { table: "provider_payouts", column: "talent_profile_id", reason: "money" },
  { table: "provider_invoices", column: "talent_profile_id", reason: "money" },
  // Orders and, through them, payment_links hang off order_lines.
  { table: "order_lines", column: "talent_profile_id", reason: "order" },
  { table: "discount_redemptions", column: "talent_profile_id", reason: "money" },
  { table: "inquiry_offer_line_items", column: "talent_profile_id", reason: "money" },
  { table: "talent_subscriptions", column: "talent_profile_id", reason: "subscription" },
  { table: "subscription_discounts", column: "talent_profile_id", reason: "subscription" },
  { table: "talent_plan_overrides", column: "talent_profile_id", reason: "subscription" },
  { table: "workspace_talent_commission_overrides", column: "talent_profile_id", reason: "commission" },
  // Rows survive soft-delete; a cascade would orphan the storage objects.
  { table: "media_assets", column: "owner_talent_profile_id", reason: "media_rows_remain" },
];

export type AccountPurgeReport = {
  cutoff: string;
  /** Exact count of anonymised, orphaned profiles past the cutoff (before the completed-request and reference checks). */
  candidates: number;
  scanned: number;
  purgeable: number;
  deleted: number;
  kept: number;
  keptByReason: Record<string, number>;
};

type CandidateRow = { id: string; deleted_at: string };

/** First guard that still has a referencing row, or null when the account is clear. */
export async function firstReference(admin: SupabaseClient, profileId: string): Promise<string | null> {
  const counts = await Promise.all(
    ACCOUNT_REFERENCE_GUARDS.map((g) =>
      headCount(
        admin.from(g.table).select("id", { count: "exact", head: true }).eq(g.column, profileId),
        g.table,
      ),
    ),
  );
  const hit = ACCOUNT_REFERENCE_GUARDS.findIndex((_, i) => counts[i] > 0);
  return hit === -1 ? null : ACCOUNT_REFERENCE_GUARDS[hit].reason;
}

export async function runAccountPurge(
  admin: SupabaseClient,
  opts: { now: Date; enforce: boolean; errors: string[]; page?: number; maxDeletes?: number },
): Promise<AccountPurgeReport> {
  const page = opts.page ?? ACCOUNT_PURGE_PAGE;
  const maxDeletes = opts.maxDeletes ?? MAX_ACCOUNT_DELETES_PER_RUN;
  const cutoff = daysBefore(opts.now, RETENTION_PERIODS.deletedAccountPurgeDaysAfterGrace).toISOString();
  const report: AccountPurgeReport = {
    cutoff,
    candidates: 0,
    scanned: 0,
    purgeable: 0,
    deleted: 0,
    kept: 0,
    keptByReason: {},
  };
  const keep = (reason: string) => {
    report.kept += 1;
    report.keptByReason[reason] = (report.keptByReason[reason] ?? 0) + 1;
  };

  try {
    report.candidates = await headCount(
      admin
        .from("talent_profiles")
        .select("id", { count: "exact", head: true })
        .is("user_id", null)
        .eq("display_name", DELETED_USER_LABEL)
        .not("deleted_at", "is", null)
        .lt("deleted_at", cutoff),
      "talent_profiles.candidates",
    );
    if (report.candidates === 0) return report;

    let cursor: CandidateRow | null = null;
    for (let p = 0; p < MAX_ACCOUNT_PURGE_PAGES; p++) {
      let query = admin
        .from("talent_profiles")
        .select("id, deleted_at")
        .is("user_id", null)
        .eq("display_name", DELETED_USER_LABEL)
        .not("deleted_at", "is", null)
        .lt("deleted_at", cutoff)
        .order("deleted_at", { ascending: true })
        .order("id", { ascending: true });
      if (cursor) {
        query = query.or(
          `deleted_at.gt.${cursor.deleted_at},and(deleted_at.eq.${cursor.deleted_at},id.gt.${cursor.id})`,
        );
      }
      const { data, error } = await query.limit(page);
      if (error) throw new Error(`talent_profiles.scan: ${error.message}`);
      const rows = (data ?? []) as CandidateRow[];
      if (rows.length === 0) break;
      report.scanned += rows.length;

      // Tie each profile to a COMPLETED deletion request by the shared run timestamp.
      const { data: reqs, error: rErr } = await admin
        .from("account_deletion_requests")
        .select("completed_at")
        .eq("status", "completed")
        .in("completed_at", Array.from(new Set(rows.map((r) => r.deleted_at))));
      if (rErr) throw new Error(`account_deletion_requests: ${rErr.message}`);
      const completedAt = new Set(
        ((reqs ?? []) as Array<{ completed_at: string | null }>)
          .filter((r) => r.completed_at)
          .map((r) => new Date(r.completed_at as string).getTime()),
      );

      for (const row of rows) {
        if (!completedAt.has(new Date(row.deleted_at).getTime())) {
          keep("no_completed_request");
          continue;
        }
        let reason: string | null;
        try {
          reason = await firstReference(admin, row.id);
        } catch (e) {
          // An unreadable guard is never "no reference": keep the account.
          opts.errors.push(`account_purge ${row.id}: ${errorMessage(e)}`);
          keep("guard_read_failed");
          continue;
        }
        if (reason) {
          keep(reason);
          continue;
        }
        report.purgeable += 1;
        if (!opts.enforce || report.deleted >= maxDeletes) continue;
        const { error: dErr } = await admin
          .from("talent_profiles")
          .delete()
          .eq("id", row.id)
          .is("user_id", null)
          .eq("display_name", DELETED_USER_LABEL);
        if (dErr) {
          opts.errors.push(`account_purge ${row.id}: ${dErr.message}`);
          continue;
        }
        report.deleted += 1;
      }
      if (rows.length < page || (opts.enforce && report.deleted >= maxDeletes)) break;
      cursor = rows[rows.length - 1];
    }
  } catch (e) {
    opts.errors.push(`account_purge: ${errorMessage(e)}`);
  }
  return report;
}
