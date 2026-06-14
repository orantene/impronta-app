import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { logServerError } from "@/lib/server/safe-error";
import { sendEmailNotification } from "./channels/email";
import { findCatalogEntryById } from "./catalog";
import { isEmailSuppressed } from "./suppressions";
import type { NotificationEvent, RecipientRole, ResolvedRecipient } from "./types";

/**
 * Failed-email retry sweep (spec §11 / Phase 9).
 *
 * The dispatcher flips a dispatch_log row to `status = 'failed'` when a channel
 * send throws (Resend 5xx, transient network, rate limit). This cron re-runs
 * the email channel handler for those rows: it reconstructs the event + entry +
 * recipient from the logged columns and re-renders + re-sends. A recovered send
 * flips the row back to `sent`; a fresh failure leaves it `failed` to be tried
 * again next sweep.
 *
 * Bounding (two independent guards): a row is retried only while it is BOTH
 * younger than RETRY_MAX_AGE_HOURS and under MAX_ATTEMPTS retries. The attempts
 * counter is the hard cap — a row that keeps failing stops at MAX_ATTEMPTS even
 * if the age window is widened later, so a permanently-dead send can never loop
 * forever. Suppressed addresses are flipped to `suppressed` and not retried. The
 * handler is a pure send-effect (it never touches dispatch_log), so re-running it
 * can't double-log.
 *
 * Zombie reaper: a `queued` row is normally a digest waiting for its batch window
 * (≤24 h). A row left `queued` well past every window is stuck (the digest sweep
 * could never resolve its recipient/category). The reaper marks those terminal
 * `skipped` so they stop showing as perpetually-pending in the console.
 */

/** Only retry failures younger than this. Older rows are abandoned. */
const RETRY_MAX_AGE_HOURS = 24;

/**
 * Hard cap on automatic retries per row. With the hourly cron this is ~6 h of
 * attempts; combined with the 24 h age window, whichever bound trips first wins.
 * The manual console "Retry" button ignores this cap (an explicit admin action).
 */
const MAX_ATTEMPTS = 6;

/**
 * A `queued` row older than this is considered a stuck digest (every batch window
 * is ≤24 h) and is reaped to terminal `skipped`. Generous buffer beyond the
 * daily window so an in-flight digest is never reaped out from under the sweep.
 */
const QUEUED_REAP_AGE_HOURS = 48;

export type RetryRow = {
  id: string;
  tenant_id: string | null;
  inquiry_id: string | null;
  recipient_user_id: string | null;
  recipient_email: string | null;
  catalog_entry_id: string | null;
  event_kind: string;
  dedupe_key: string | null;
  locale: string | null;
  payload: Record<string, unknown> | null;
  created_at: string;
  attempts: number | null;
};

export type RetryRunResult = {
  scanned: number;
  recovered: number;
  suppressed: number;
  skipped: number;
  stillFailing: number;
  /** `queued` rows past every digest window, marked terminal `skipped`. */
  reaped: number;
};

const VALID_ROLES = new Set<RecipientRole>([
  "client",
  "talent",
  "workspace_member",
  "platform_admin",
  "guest",
]);

function roleFromPayload(payload: Record<string, unknown> | null): RecipientRole {
  const raw = payload?.recipientRole;
  return typeof raw === "string" && VALID_ROLES.has(raw as RecipientRole)
    ? (raw as RecipientRole)
    : "client";
}

export async function retryFailedEmails(
  admin: SupabaseClient,
  opts: { now?: Date; limit?: number } = {},
): Promise<RetryRunResult> {
  const now = opts.now ?? new Date();
  const limit = opts.limit ?? 200;
  const result: RetryRunResult = {
    scanned: 0,
    recovered: 0,
    suppressed: 0,
    skipped: 0,
    stillFailing: 0,
    reaped: 0,
  };

  const cutoff = new Date(now.getTime() - RETRY_MAX_AGE_HOURS * 3_600_000).toISOString();

  const { data, error } = await admin
    .from("notification_dispatch_log")
    .select(
      "id, tenant_id, inquiry_id, recipient_user_id, recipient_email, catalog_entry_id, event_kind, dedupe_key, locale, payload, created_at, attempts",
    )
    .eq("status", "failed")
    .eq("channel", "email")
    .gte("created_at", cutoff)
    .lt("attempts", MAX_ATTEMPTS)
    .order("created_at", { ascending: true })
    .limit(limit);

  if (error) {
    logServerError("cron.retry.fetch", error);
    return result;
  }

  const rows = (data ?? []) as RetryRow[];
  result.scanned = rows.length;

  for (const row of rows) {
    const outcome = await retryRow(admin, row, now);
    if (outcome === "recovered") result.recovered++;
    else if (outcome === "suppressed") result.suppressed++;
    else if (outcome === "skipped") result.skipped++;
    else result.stillFailing++;
  }

  result.reaped = await reapStaleQueued(admin, now);

  return result;
}

/**
 * Mark `queued` rows older than QUEUED_REAP_AGE_HOURS as terminal `skipped`.
 * These are digest rows the sweep could never resolve (no recipient/category
 * match) — left alone they'd advertise as pending forever. Returns the count
 * reaped. A read/update failure is logged and degrades to 0 (never throws).
 */
async function reapStaleQueued(admin: SupabaseClient, now: Date): Promise<number> {
  const cutoff = new Date(now.getTime() - QUEUED_REAP_AGE_HOURS * 3_600_000).toISOString();
  const { data, error } = await admin
    .from("notification_dispatch_log")
    .update({ status: "skipped", error_message: "reaped: queued past digest window" })
    .eq("status", "queued")
    .lt("created_at", cutoff)
    .select("id");
  if (error) {
    logServerError("cron.retry.reap", error);
    return 0;
  }
  return (data ?? []).length;
}

/**
 * Manually retry ONE dispatch_log row by id — the platform-admin email console's
 * "Retry" button. Unlike the cron sweep this ignores RETRY_MAX_AGE_HOURS (an
 * explicit admin action retries regardless of age) and targets a single row.
 * Returns "not_found" when the row is missing/unreadable.
 */
export async function retryDispatchLogRow(
  admin: SupabaseClient,
  rowId: string,
): Promise<"recovered" | "suppressed" | "skipped" | "failed" | "not_found"> {
  const { data, error } = await admin
    .from("notification_dispatch_log")
    .select(
      "id, tenant_id, inquiry_id, recipient_user_id, recipient_email, catalog_entry_id, event_kind, dedupe_key, locale, payload, created_at, attempts",
    )
    .eq("id", rowId)
    .maybeSingle();
  if (error || !data) return "not_found";
  return retryRow(admin, data as RetryRow, new Date());
}

async function retryRow(
  admin: SupabaseClient,
  row: RetryRow,
  now: Date,
): Promise<"recovered" | "suppressed" | "skipped" | "failed"> {
  if (!row.recipient_email) return "skipped";

  const entry = row.catalog_entry_id ? findCatalogEntryById(row.catalog_entry_id) : null;
  if (!entry?.email) return "skipped"; // not an email-capable entry (or unknown)

  if (await isEmailSuppressed(admin, row.recipient_user_id, row.recipient_email)) {
    // Clear any stale send error from the prior 'failed' attempt so the row's
    // terminal status and its error column stay consistent (a suppressed row
    // must not keep advertising a send failure).
    await mark(admin, row.id, { status: "suppressed", error_message: null });
    return "suppressed";
  }

  const event: NotificationEvent = {
    type: row.event_kind,
    tenantId: row.tenant_id,
    inquiryId: row.inquiry_id,
    eventId: row.dedupe_key ?? row.id,
    payload: row.payload ?? {},
  };

  const recipient: ResolvedRecipient = {
    userId: row.recipient_user_id,
    email: row.recipient_email,
    displayName: null,
    locale: row.locale ?? "en",
    isPlatformAdmin: false,
    role: roleFromPayload(row.payload),
    dedupeId: row.recipient_user_id ?? `guest:${row.recipient_email}`,
  };

  // Every send-attempt (success or failure) increments the counter so the cron's
  // MAX_ATTEMPTS cap is enforced even on rows that keep failing.
  const attempts = (row.attempts ?? 0) + 1;

  try {
    const providerRef = await sendEmailNotification(event, entry, recipient, { admin });
    await mark(admin, row.id, {
      status: "sent",
      sent_at: now.toISOString(),
      provider_reference: typeof providerRef === "string" ? providerRef : null,
      error_message: null,
      attempts,
    });
    return "recovered";
  } catch (err) {
    await mark(admin, row.id, {
      status: "failed",
      error_message: (err instanceof Error ? err.message : String(err)).slice(0, 1000),
      attempts,
    });
    return "failed";
  }
}

async function mark(
  admin: SupabaseClient,
  id: string,
  patch: Record<string, unknown>,
): Promise<void> {
  const { error } = await admin.from("notification_dispatch_log").update(patch).eq("id", id);
  if (error) logServerError("cron.retry.mark", error);
}
