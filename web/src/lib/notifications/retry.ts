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
 * Bounding (there is no attempts column): only rows that failed within the last
 * RETRY_MAX_AGE_HOURS are retried, so a permanently-dead send ages out instead
 * of looping forever. Suppressed addresses are flipped to `suppressed` and not
 * retried. The handler is a pure send-effect (it never touches dispatch_log),
 * so re-running it can't double-log.
 */

/** Only retry failures younger than this. Older rows are abandoned. */
const RETRY_MAX_AGE_HOURS = 24;

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
};

export type RetryRunResult = {
  scanned: number;
  recovered: number;
  suppressed: number;
  skipped: number;
  stillFailing: number;
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
  };

  const cutoff = new Date(now.getTime() - RETRY_MAX_AGE_HOURS * 3_600_000).toISOString();

  const { data, error } = await admin
    .from("notification_dispatch_log")
    .select(
      "id, tenant_id, inquiry_id, recipient_user_id, recipient_email, catalog_entry_id, event_kind, dedupe_key, locale, payload, created_at",
    )
    .eq("status", "failed")
    .eq("channel", "email")
    .gte("created_at", cutoff)
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

  return result;
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
      "id, tenant_id, inquiry_id, recipient_user_id, recipient_email, catalog_entry_id, event_kind, dedupe_key, locale, payload, created_at",
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
    await mark(admin, row.id, { status: "suppressed" });
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

  try {
    const providerRef = await sendEmailNotification(event, entry, recipient, { admin });
    await mark(admin, row.id, {
      status: "sent",
      sent_at: now.toISOString(),
      provider_reference: typeof providerRef === "string" ? providerRef : null,
      error_message: null,
    });
    return "recovered";
  } catch (err) {
    await mark(admin, row.id, {
      status: "failed",
      error_message: (err instanceof Error ? err.message : String(err)).slice(0, 1000),
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
