import "server-only";

import * as React from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { logServerError } from "@/lib/server/safe-error";
import { resolveTenantBrand } from "@/lib/brand/resolve-tenant-brand";
import { renderEmailHtml } from "@/lib/email/render";
import { sendEmail } from "@/lib/email";
import DigestEmail, { type DigestItem } from "../../../emails/notifications/Digest";
import { findCatalogEntryById } from "./catalog";
import { appPageUrl, inquiryDeepLinkForRole } from "./catalog-render";
import { NOTIFICATION_CATEGORIES } from "./categories";
import { isEmailSuppressed } from "./suppressions";
import {
  buildUnsubscribeApiUrl,
  buildUnsubscribeUrl,
  getUnsubscribeToken,
} from "./unsubscribe";
import type { NotificationCategory, RecipientRole } from "./types";

/**
 * Digest sweep (spec §7) — the consumer side of the batching policy.
 *
 * High-frequency events (messages especially) write their dispatch_log row with
 * `status = 'queued'` and `payload.digest = true` instead of sending one email
 * each. This cron-driven sweep collapses every queued digest row for a
 * `(recipient, category)` pair into a single summary email once that category's
 * batch window has elapsed:
 *
 *   messages         → 30 min   (5 messages → 1 email)
 *   roster_activity  → 60 min
 *   everything else  → 24 h     (the user-chosen "daily digest" path)
 *
 * Rows whose window hasn't closed yet are left queued for a later sweep, so the
 * cron is safe to run as often as we like (every 15 min by default). Marking
 * the collapsed rows `sent` is the idempotency boundary — a re-run can't double
 * send because they're no longer `queued`.
 *
 * NOTE: no catalog entry sets `payload.digest = true` today, so in production
 * this sweep is a no-op until a producer opts a category into batching (a
 * one-line change in the dispatcher / a "daily digest" preference). It is built
 * defensively so it does the right thing the moment a producer appears.
 */

// ─── Pure helpers (unit-tested in digest.test.ts) ─────────────────────────────

/** Per-category batch window in minutes. Absent category ⇒ daily. */
const DIGEST_WINDOW_MINUTES: Partial<Record<NotificationCategory, number>> = {
  messages: 30,
  roster_activity: 60,
};
/** Forced "daily digest" (a user preference) + any non-defaulted category. */
const DEFAULT_DIGEST_WINDOW_MINUTES = 24 * 60;

export function digestWindowMinutes(category: NotificationCategory | null): number {
  const w = category ? DIGEST_WINDOW_MINUTES[category] : undefined;
  return w ?? DEFAULT_DIGEST_WINDOW_MINUTES;
}

/** Non-empty trimmed string, else null. */
function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v : null;
}

const VALID_CATEGORIES = new Set<string>(Object.keys(NOTIFICATION_CATEGORIES));

/** A queued dispatch_log row, narrowed to the fields the sweep reads. */
export type DigestRow = {
  id: string;
  tenant_id: string | null;
  inquiry_id: string | null;
  recipient_user_id: string | null;
  recipient_email: string | null;
  catalog_entry_id: string | null;
  event_kind: string;
  locale: string | null;
  payload: Record<string, unknown> | null;
  created_at: string;
};

/**
 * Resolve a logged row back to its notification category: prefer the catalog
 * entry id, fall back to an explicit `payload.category`, else null.
 */
export function categoryForRow(
  row: Pick<DigestRow, "catalog_entry_id" | "payload">,
): NotificationCategory | null {
  if (row.catalog_entry_id) {
    const entry = findCatalogEntryById(row.catalog_entry_id);
    if (entry) return entry.category;
  }
  const fromPayload = str(row.payload?.category);
  if (fromPayload && VALID_CATEGORIES.has(fromPayload)) {
    return fromPayload as NotificationCategory;
  }
  return null;
}

const CATEGORY_FALLBACK_LINE: Partial<Record<NotificationCategory, string>> = {
  messages: "You have a new message",
  roster_activity: "New roster activity",
  inquiry_updates: "An inquiry was updated",
  offers: "There's an update on an offer",
  bookings: "There's an update on a booking",
  payments: "There's a payment update",
  workspace_activity: "New workspace activity",
};

/** A one-line human summary for a row — producer-supplied, else a category default. */
export function digestSummaryLine(
  row: Pick<DigestRow, "payload">,
  category: NotificationCategory | null,
): string {
  const p = row.payload ?? {};
  const explicit =
    str(p.digestSummary) ?? str(p.summary) ?? str(p.preview) ?? str(p.title) ?? str(p.message);
  if (explicit) return explicit.length > 200 ? `${explicit.slice(0, 199)}…` : explicit;
  return (category && CATEGORY_FALLBACK_LINE[category]) || "You have a new notification";
}

/** "HH:MM UTC" label for an ISO timestamp, or null if unparseable. */
export function digestTimeLabel(iso: string): string | null {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return `${d.toISOString().slice(11, 16)} UTC`;
}

export type DigestBatch = {
  key: string;
  recipientUserId: string | null;
  email: string | null;
  tenantId: string | null;
  category: NotificationCategory | null;
  locale: string;
  rows: DigestRow[];
};

/**
 * Group queued rows into `(recipient, category)` batches. Rows are expected
 * oldest-first (the query orders by created_at asc) so each batch's `rows[0]`
 * is the oldest member — the one whose age drives the window check.
 */
export function groupDigestRows(rows: DigestRow[]): DigestBatch[] {
  const map = new Map<string, DigestBatch>();
  for (const row of rows) {
    const idPart =
      row.recipient_user_id ??
      (row.recipient_email ? `guest:${row.recipient_email.toLowerCase()}` : null);
    if (!idPart) continue; // no recipient identity — can't address a digest
    const category = categoryForRow(row);
    const key = `${idPart}::${category ?? "uncategorized"}`;
    let batch = map.get(key);
    if (!batch) {
      batch = {
        key,
        recipientUserId: row.recipient_user_id,
        email: row.recipient_email,
        tenantId: row.tenant_id,
        category,
        locale: row.locale ?? "en",
        rows: [],
      };
      map.set(key, batch);
    }
    batch.rows.push(row);
    if (!batch.email && row.recipient_email) batch.email = row.recipient_email;
  }
  return [...map.values()];
}

/** True once the oldest row in the batch has aged past its category window. */
export function isBatchReady(batch: DigestBatch, now: Date): boolean {
  const oldest = batch.rows[0];
  if (!oldest) return false;
  const ageMin = (now.getTime() - new Date(oldest.created_at).getTime()) / 60_000;
  return ageMin >= digestWindowMinutes(batch.category);
}

/** Subject + heading line for a digest of `count` notifications in `category`. */
export function digestHeading(category: NotificationCategory | null, count: number): string {
  if (category === "messages") {
    return count === 1 ? "You have 1 new message" : `You have ${count} new messages`;
  }
  if (category === "roster_activity") {
    return count === 1 ? "1 roster update" : `${count} roster updates`;
  }
  return count === 1 ? "You have 1 new notification" : `You have ${count} new notifications`;
}

function digestIntro(category: NotificationCategory | null): string {
  if (category === "messages") return "here's a summary of your recent messages:";
  if (category === "roster_activity") return "here's a summary of recent roster activity:";
  return "here's a summary of your recent notifications:";
}

/** Resolve the digest CTA from the newest row in the batch (app-host dashboard link). */
export function digestCtaPath(
  batch: Pick<DigestBatch, "category" | "rows">,
  tenantSlug: string | null,
): string {
  const newest = batch.rows[batch.rows.length - 1];
  const inquiryId =
    newest?.inquiry_id ?? str(newest?.payload?.inquiryId) ?? null;
  const role = (str(newest?.payload?.recipientRole) as RecipientRole | null) ?? null;

  if (batch.category === "messages") {
    return inquiryDeepLinkForRole(role ?? "client", inquiryId, tenantSlug);
  }

  if (role) {
    return inquiryDeepLinkForRole(role, inquiryId, tenantSlug);
  }

  return tenantSlug ? `/${tenantSlug}/client/messages` : "/client";
}

// ─── Orchestration (DB-bound) ─────────────────────────────────────────────────

export type DigestRunResult = {
  scanned: number;
  batches: number;
  flushed: number;
  suppressed: number;
  waiting: number;
  failed: number;
};

/**
 * Run one digest sweep. Fetches queued email digest rows, groups them, and
 * flushes every batch whose window has closed into a single summary email.
 */
export async function processQueuedDigests(
  admin: SupabaseClient,
  opts: { now?: Date; limit?: number } = {},
): Promise<DigestRunResult> {
  const now = opts.now ?? new Date();
  const limit = opts.limit ?? 1000;
  const result: DigestRunResult = {
    scanned: 0,
    batches: 0,
    flushed: 0,
    suppressed: 0,
    waiting: 0,
    failed: 0,
  };

  const { data, error } = await admin
    .from("notification_dispatch_log")
    .select(
      "id, tenant_id, inquiry_id, recipient_user_id, recipient_email, catalog_entry_id, event_kind, locale, payload, created_at",
    )
    .eq("status", "queued")
    .eq("channel", "email")
    .eq("payload->>digest", "true")
    .order("created_at", { ascending: true })
    .limit(limit);

  if (error) {
    logServerError("cron.digest.fetch", error);
    return result;
  }

  const rows = (data ?? []) as DigestRow[];
  result.scanned = rows.length;

  const batches = groupDigestRows(rows);
  result.batches = batches.length;

  for (const batch of batches) {
    if (!isBatchReady(batch, now)) {
      result.waiting++;
      continue;
    }
    const ids = batch.rows.map((r) => r.id);
    try {
      const outcome = await flushBatch(admin, batch, now);
      if (outcome === "sent") result.flushed++;
      else if (outcome === "suppressed") result.suppressed++;
      else result.failed++;
    } catch (err) {
      result.failed++;
      logServerError(
        "cron.digest.flush",
        err instanceof Error ? err : new Error(String(err)),
      );
      // Hand the batch to the retry cron as individual failed sends rather than
      // looping on a render/send error forever.
      await markRows(admin, ids, {
        status: "failed",
        error_message: "digest flush error",
      });
    }
  }

  return result;
}

async function flushBatch(
  admin: SupabaseClient,
  batch: DigestBatch,
  now: Date,
): Promise<"sent" | "suppressed" | "failed"> {
  const ids = batch.rows.map((r) => r.id);

  if (!batch.email) {
    await markRows(admin, ids, { status: "failed", error_message: "digest: no recipient email" });
    return "failed";
  }

  // A bounce / complaint may have landed after these rows were queued.
  if (await isEmailSuppressed(admin, batch.recipientUserId, batch.email)) {
    await markRows(admin, ids, { status: "suppressed" });
    return "suppressed";
  }

  const brand = await resolveTenantBrand(batch.tenantId);
  const category = batch.category;
  const count = batch.rows.length;
  const items: DigestItem[] = batch.rows.map((r) => ({
    summary: digestSummaryLine(r, category),
    timeLabel: digestTimeLabel(r.created_at),
  }));

  const label = category ? NOTIFICATION_CATEGORIES[category].label : "Notifications";
  const heading = digestHeading(category, count);

  let tenantSlug: string | null = null;
  if (batch.tenantId) {
    const { data: agencyRow } = await admin
      .from("agencies")
      .select("slug")
      .eq("id", batch.tenantId)
      .maybeSingle();
    tenantSlug = (agencyRow?.slug as string | null)?.trim() || null;
  }

  const ctaUrl = appPageUrl(digestCtaPath(batch, tenantSlug));

  // Per-category one-click unsubscribe (account-holders, non-required only).
  let unsubscribeUrl: string | undefined;
  let headers: Record<string, string> | undefined;
  if (batch.recipientUserId && category && !NOTIFICATION_CATEGORIES[category].required) {
    const token = await getUnsubscribeToken(admin, batch.recipientUserId);
    if (token) {
      unsubscribeUrl = buildUnsubscribeUrl(token, category);
      headers = {
        "List-Unsubscribe": `<${buildUnsubscribeApiUrl(token, category)}>`,
        "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
      };
    }
  }

  const element = React.createElement(DigestEmail, {
    recipientName: null,
    heading,
    intro: digestIntro(category),
    items,
    ctaUrl,
    ctaLabel: `Open ${brand.accountName} →`,
    brand,
    unsubscribeUrl,
    categoryLabel: label.toLowerCase(),
  });
  const html = await renderEmailHtml(element);

  const providerRef = await sendEmail({ to: batch.email, subject: heading, html, headers });

  await markRows(admin, ids, {
    status: "sent",
    sent_at: now.toISOString(),
    provider_reference: providerRef,
  });
  return "sent";
}

async function markRows(
  admin: SupabaseClient,
  ids: string[],
  patch: Record<string, unknown>,
): Promise<void> {
  if (ids.length === 0) return;
  const { error } = await admin.from("notification_dispatch_log").update(patch).in("id", ids);
  if (error) logServerError("cron.digest.mark", error);
}
