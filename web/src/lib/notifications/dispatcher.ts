import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { logServerError } from "@/lib/server/safe-error";
import { buildAudienceContext, hydrateAudience } from "./audience";
import { findCatalogEntries } from "./catalog";
import { sendEmailNotification } from "./channels/email";
import { sendInAppNotification } from "./channels/in_app";
import { channelsForRecipient } from "./prefs";
import type {
  AudienceContext,
  CatalogEntry,
  DispatchResult,
  NotificationChannel,
  NotificationEvent,
  ResolvedRecipient,
} from "./types";

/**
 * The dispatcher (spec §2.2) — the heart of the engine.
 *
 * For a domain event it finds the matching catalog entries, resolves +
 * hydrates each entry's audience, picks the live channels each recipient
 * should receive (preferences + suppressions), and runs the channel handler
 * exactly once per `(event, recipient, channel)`.
 *
 * Key invariants:
 *  - The dispatch_log row is inserted BEFORE the channel send. The unique
 *    index on `dedupe_key` makes a duplicate `(event, recipient, channel)` a
 *    no-op — this is the idempotency guarantee.
 *  - Channel handlers are pure send-effects: they don't pick recipients,
 *    dedupe, or read preferences.
 *  - One failed send never blocks the rest. Failures flip the log row to
 *    `failed` and increment the counter; the loop continues.
 *  - This is fire-and-forget from the engine's perspective; callers should
 *    `void` it (or await only when they need the counts, e.g. tests).
 */
export async function dispatchEventNotifications(
  event: NotificationEvent,
): Promise<DispatchResult> {
  const result: DispatchResult = { dispatched: 0, suppressed: 0, failed: 0 };

  const entries = findCatalogEntries(event.type);
  if (entries.length === 0) return result;

  const ctx = buildAudienceContext();
  if (!ctx) {
    logServerError(
      "notifications.dispatch",
      new Error("service-role client unavailable — cannot dispatch notifications"),
    );
    return result;
  }

  const handlers: Partial<Record<NotificationChannel, ChannelHandler>> = {
    email: sendEmailNotification,
    in_app: sendInAppNotification,
  };

  for (const entry of entries) {
    // Entry-specific hydration: enrich the event payload with whatever this
    // entry's audience resolver + templates need (inquiry context, offer
    // total, …). Runs once per entry; a failure degrades to the bare event
    // rather than dropping the notification.
    let enriched = event;
    if (entry.hydrate) {
      try {
        const extra = await entry.hydrate(event, ctx);
        enriched = { ...event, payload: { ...event.payload, ...extra } };
      } catch (err) {
        logServerError(
          `notifications.hydrate:${entry.id}`,
          err instanceof Error ? err : new Error(String(err)),
        );
      }
    }

    let recipients: ResolvedRecipient[] = [];
    try {
      const members = await entry.resolveAudience(enriched, ctx);
      recipients = await hydrateAudience(members, ctx);
    } catch (err) {
      logServerError(
        `notifications.audience:${entry.id}`,
        err instanceof Error ? err : new Error(String(err)),
      );
      continue;
    }

    for (const recipient of recipients) {
      const channels = await channelsForRecipient(entry, recipient, ctx);
      for (const channel of channels) {
        const handler = handlers[channel];
        if (!handler) continue;

        const dedupeKey = `${enriched.eventId}:${recipient.dedupeId}:${channel}`;
        const logId = await tryInsertDispatchLog(ctx.admin, {
          event: enriched,
          recipient,
          channel,
          entry,
          dedupeKey,
        });
        if (!logId) {
          // Duplicate (already attempted) or could not be logged — skip the send.
          result.suppressed++;
          continue;
        }

        try {
          const providerRef = await handler(enriched, entry, recipient, ctx);
          await markDispatchLogSent(
            ctx.admin,
            logId,
            typeof providerRef === "string" ? providerRef : null,
          );
          result.dispatched++;
        } catch (err) {
          await markDispatchLogFailed(ctx.admin, logId, err);
          result.failed++;
        }
      }
    }
  }

  return result;
}

// Handlers may return a provider message id (the email channel returns the
// Resend id; in_app returns void). The dispatcher persists a string return as
// the dispatch_log `provider_reference` for webhook correlation.
type ChannelHandler = (
  event: NotificationEvent,
  entry: CatalogEntry,
  recipient: ResolvedRecipient,
  ctx: AudienceContext,
) => Promise<string | null | void>;

type DispatchLogInsertArgs = {
  event: NotificationEvent;
  recipient: ResolvedRecipient;
  channel: NotificationChannel;
  entry: CatalogEntry;
  dedupeKey: string;
};

/**
 * Insert a `queued` dispatch_log row. Returns the row id when newly inserted,
 * or null when the dedupe key already exists (unique-violation 23505) or the
 * insert otherwise fails — in both cases the caller skips the send.
 */
async function tryInsertDispatchLog(
  admin: SupabaseClient,
  { event, recipient, channel, entry, dedupeKey }: DispatchLogInsertArgs,
): Promise<string | null> {
  const { data, error } = await admin
    .from("notification_dispatch_log")
    .insert({
      tenant_id: event.tenantId,
      inquiry_id: event.inquiryId ?? null,
      recipient_user_id: recipient.userId,
      recipient_email: recipient.email,
      event_kind: event.type,
      channel,
      status: "queued",
      dedupe_key: dedupeKey,
      template_id: entry.email?.templateId ?? null,
      catalog_entry_id: entry.id,
      locale: recipient.locale,
      payload: event.payload ?? {},
    })
    .select("id")
    .single();

  if (error) {
    // 23505 = unique_violation on dedupe_key — this exact send was already
    // attempted. Expected on retries; don't log it as an error.
    if ((error as { code?: string }).code !== "23505") {
      logServerError("notifications.dispatchLog.insert", error);
    }
    return null;
  }
  return (data as { id: string }).id;
}

async function markDispatchLogSent(
  admin: SupabaseClient,
  id: string,
  providerRef: string | null,
): Promise<void> {
  const { error } = await admin
    .from("notification_dispatch_log")
    .update({
      status: "sent",
      sent_at: new Date().toISOString(),
      // Resend message id (email channel). Null for in_app / dev no-op sends.
      provider_reference: providerRef,
    })
    .eq("id", id);
  if (error) logServerError("notifications.dispatchLog.markSent", error);
}

async function markDispatchLogFailed(
  admin: SupabaseClient,
  id: string,
  err: unknown,
): Promise<void> {
  const message = (err instanceof Error ? err.message : String(err)).slice(0, 1000);
  const { error } = await admin
    .from("notification_dispatch_log")
    .update({ status: "failed", error_message: message })
    .eq("id", id);
  if (error) logServerError("notifications.dispatchLog.markFailed", error);
}
