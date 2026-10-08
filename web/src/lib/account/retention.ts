import type { SupabaseClient } from "@supabase/supabase-js";

import { RETENTION_PERIODS } from "@/lib/legal/retention-config";

import { ANONYMIZED_EMAIL_DOMAIN, DELETED_USER_LABEL } from "./anonymize";
import { runAccountPurge, type AccountPurgeReport } from "./retention-account-purge";
import { runLogTrims, type LogTrimReport } from "./retention-log-trims";

/**
 * Data retention (legal plan 3.4). periods are the owner
 * decisions of 2026-10-01 (src/lib/legal/retention-config.ts):
 *   - guest contact data on inquiries: anonymized 3 years after last activity;
 *   - unbooked inquiries and their messages: deleted 3 years after last activity;
 *   - bookings and payment records: NEVER purged by this job (kept until the
 *     legal answer on tax record retention, TUL-43).
 * Also (same RETENTION_ENFORCE flag, dry run by default):
 *   - anonymised accounts hard-deleted 30 days after the deletion completed
 *     (retention-account-purge.ts), only when nothing financial references them;
 *   - analytics_events and notification_dispatch_log trimmed at 90 days
 *     (retention-log-trims.ts).
 * Deleted media (30 days) is the media reaper's job, still behind
 * MEDIA_REAPER_ENABLED, which this module does NOT flip.
 *
 * DRY RUN BY DEFAULT. Nothing is written unless RETENTION_ENFORCE === "true";
 * otherwise the cron logs what it WOULD do, so the counts can be reviewed
 * before the switch is turned on.
 *
 * An inquiry is purgeable only if nothing financial hangs off it: deleting an
 * inquiry is the start of a cascade, so any booking, transaction or payment
 * link referencing it keeps it forever (under this job).
 */

export const GUEST_CONTACT_RETENTION_MONTHS = RETENTION_PERIODS.messagesAndBookingsYears * 12;
export const UNBOOKED_INQUIRY_RETENTION_MONTHS = RETENTION_PERIODS.messagesAndBookingsYears * 12;
export const RETENTION_BATCH = 200;
/** Upper bound on pages scanned per run, so one cron call stays bounded. */
export const MAX_RETENTION_PAGES = 25;

type InquiryScanRow = { id: string; status: string; booked_at: string | null; updated_at: string };
export const GUEST_ANON_EMAIL = `guest@${ANONYMIZED_EMAIL_DOMAIN}`;

export function retentionEnforced(env: Record<string, string | undefined> = process.env): boolean {
  return env.RETENTION_ENFORCE === "true";
}

export function monthsBefore(now: Date, months: number): Date {
  const d = new Date(now.getTime());
  d.setUTCMonth(d.getUTCMonth() - months);
  return d;
}

/** Statuses that mean the inquiry turned into work. Never purged. */
const BOOKED_STATUSES = new Set(["converted"]);

export type PurgeCandidate = {
  id: string;
  status: string;
  bookedAt: string | null;
  updatedAt: string;
  lastMessageAt: string | null;
  bookingCount: number;
  transactionCount: number;
  paymentLinkCount: number;
};

export function isPurgeableInquiry(c: PurgeCandidate, cutoff: Date): boolean {
  if (c.bookedAt) return false;
  if (BOOKED_STATUSES.has(c.status)) return false;
  if (c.bookingCount > 0 || c.transactionCount > 0 || c.paymentLinkCount > 0) return false;
  const last = Math.max(
    new Date(c.updatedAt).getTime(),
    c.lastMessageAt ? new Date(c.lastMessageAt).getTime() : 0,
  );
  return last < cutoff.getTime();
}

export type RetentionReport = {
  enforce: boolean;
  guestContact: { cutoff: string; matched: number; anonymized: number };
  unbookedInquiries: { cutoff: string; scanned: number; purgeable: number; deleted: number; kept: number };
  /** Anonymised accounts past grace + 30 days (retention-account-purge.ts). */
  deletedAccounts: AccountPurgeReport;
  analyticsEvents: LogTrimReport;
  notificationDispatchLog: LogTrimReport;
  errors: string[];
};

async function headCount(
  q: PromiseLike<{ count: number | null; error: { message: string } | null }>,
  label: string,
): Promise<number> {
  const { count, error } = await q;
  if (error) throw new Error(`${label}: ${error.message}`);
  return count ?? 0;
}

export async function runRetention(
  admin: SupabaseClient,
  opts: { now?: Date; enforce?: boolean; batch?: number } = {},
): Promise<RetentionReport> {
  const now = opts.now ?? new Date();
  const enforce = opts.enforce ?? retentionEnforced();
  const batch = opts.batch ?? RETENTION_BATCH;
  const errors: string[] = [];

  // ── 1. guest contact data, 3 years ────────────────────────────────────
  const guestCutoff = monthsBefore(now, GUEST_CONTACT_RETENTION_MONTHS);
  const guest = { cutoff: guestCutoff.toISOString(), matched: 0, anonymized: 0 };
  try {
    const guestQuery = () =>
      admin
        .from("inquiries")
        .select("id", { count: "exact" })
        .is("client_user_id", null)
        .lt("updated_at", guest.cutoff)
        .not("contact_email", "ilike", `%@${ANONYMIZED_EMAIL_DOMAIN}`);
    const { data, count, error } = await guestQuery().limit(batch);
    if (error) throw new Error(error.message);
    guest.matched = count ?? 0;
    const ids = ((data ?? []) as Array<{ id: string }>).map((r) => r.id);
    if (enforce && ids.length > 0) {
      const { error: uErr } = await admin
        .from("inquiries")
        .update({
          contact_name: DELETED_USER_LABEL,
          contact_email: GUEST_ANON_EMAIL,
          contact_phone: null,
          company: null,
        })
        .in("id", ids)
        .is("client_user_id", null);
      if (uErr) throw new Error(uErr.message);
      guest.anonymized = ids.length;
    }
  } catch (e) {
    errors.push(`guest_contact: ${e instanceof Error ? e.message : String(e)}`);
  }

  // ── 2. unbooked inquiries + messages, 3 years ─────────────────────────
  const purgeCutoff = monthsBefore(now, UNBOOKED_INQUIRY_RETENTION_MONTHS);
  const purge = { cutoff: purgeCutoff.toISOString(), scanned: 0, purgeable: 0, deleted: 0, kept: 0 };
  try {
    // Keyset cursor over (updated_at, id): inquiries kept because bookings or
    // payments hang off them are skipped over, never rescanned, so later idle
    // inquiries are reached. Bounded pages per run.
    let cursor: { updated_at: string; id: string } | null = null;
    let rows: InquiryScanRow[] = [];
    for (let page = 0; page < MAX_RETENTION_PAGES; page++) {
      let query = admin
        .from("inquiries")
        .select("id, status, booked_at, updated_at")
        .is("booked_at", null)
        .lt("updated_at", purge.cutoff)
        .order("updated_at", { ascending: true })
        .order("id", { ascending: true });
      if (cursor) {
        query = query.or(
          `updated_at.gt.${cursor.updated_at},and(updated_at.eq.${cursor.updated_at},id.gt.${cursor.id})`,
        );
      }
      const { data, error } = await query.limit(batch);
      if (error) throw new Error(error.message);
      const pageRows = (data ?? []) as InquiryScanRow[];
      rows = rows.concat(pageRows);
      if (pageRows.length < batch) break;
      const last = pageRows[pageRows.length - 1];
      cursor = { updated_at: last.updated_at, id: last.id };
    }
    purge.scanned = rows.length;

    for (const row of rows) {
      const [bookingCount, transactionCount, paymentLinkCount] = await Promise.all([
        headCount(
          admin.from("agency_bookings").select("id", { count: "exact", head: true }).eq("source_inquiry_id", row.id),
          "agency_bookings",
        ),
        headCount(
          admin.from("booking_transactions").select("id", { count: "exact", head: true }).eq("source_inquiry_id", row.id),
          "booking_transactions",
        ),
        headCount(
          admin.from("payment_links").select("id", { count: "exact", head: true }).eq("inquiry_id", row.id),
          "payment_links",
        ),
      ]);
      const { data: lastMsg, error: mErr } = await admin
        .from("inquiry_messages")
        .select("created_at")
        .eq("inquiry_id", row.id)
        .order("created_at", { ascending: false })
        .limit(1);
      if (mErr) throw new Error(`inquiry_messages: ${mErr.message}`);

      const candidate: PurgeCandidate = {
        id: row.id,
        status: row.status,
        bookedAt: row.booked_at,
        updatedAt: row.updated_at,
        lastMessageAt: ((lastMsg ?? []) as Array<{ created_at: string }>)[0]?.created_at ?? null,
        bookingCount,
        transactionCount,
        paymentLinkCount,
      };
      if (!isPurgeableInquiry(candidate, purgeCutoff)) {
        purge.kept += 1;
        continue;
      }
      purge.purgeable += 1;
      if (enforce) {
        // Messages, events, participants cascade with the inquiry.
        const { error: dErr } = await admin.from("inquiries").delete().eq("id", row.id).is("booked_at", null);
        if (dErr) {
          errors.push(`purge ${row.id}: ${dErr.message}`);
          continue;
        }
        purge.deleted += 1;
      }
    }
  } catch (e) {
    errors.push(`unbooked_inquiries: ${e instanceof Error ? e.message : String(e)}`);
  }

  // ── 3. anonymised accounts, grace + 30 days ───────────────────────────
  // Each step collects its own failures into `errors`; one never stops the others.
  const deletedAccounts = await runAccountPurge(admin, { now, enforce, errors });

  // ── 4. logs, 90 days ──────────────────────────────────────────────────
  const { analyticsEvents, notificationDispatchLog } = await runLogTrims(admin, { now, enforce, errors });

  return {
    enforce,
    guestContact: guest,
    unbookedInquiries: purge,
    deletedAccounts,
    analyticsEvents,
    notificationDispatchLog,
    errors,
  };
}
