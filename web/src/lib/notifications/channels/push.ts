import "server-only";

import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError } from "@/lib/server/safe-error";
import { supportFrom } from "@/lib/support/support-from";
import type {
  AudienceContext,
  CatalogEntry,
  NotificationEvent,
  ResolvedRecipient,
} from "../types";

function vapidConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim() &&
      process.env.VAPID_PRIVATE_KEY?.trim() &&
      process.env.VAPID_SUBJECT?.trim(),
  );
}

function payloadUrl(event: NotificationEvent, entry: CatalogEntry): string {
  const adminPath = event.payload.adminPath;
  const replyPath = event.payload.replyPath;
  if (typeof adminPath === "string" && adminPath.startsWith("/")) return adminPath;
  if (typeof replyPath === "string" && replyPath.startsWith("/")) return replyPath;
  if (entry.in_app?.targetPayload) {
    const p = entry.in_app.targetPayload(event);
    const id = p.ticketId;
    if (typeof id === "string") return `/platform/admin/support?ticket=${id}`;
  }
  return "/";
}

/**
 * Web Push channel. No-ops (`null`) when VAPID env is unset or the recipient
 * has no active subscriptions. Prunes 404/410 endpoints. Throws only if every
 * remaining endpoint fails.
 */
export async function sendPushNotification(
  event: NotificationEvent,
  entry: CatalogEntry,
  recipient: ResolvedRecipient,
  _ctx: AudienceContext,
): Promise<string | null> {
  if (!vapidConfigured()) return null;
  if (!recipient.userId) return null;

  const admin = createServiceRoleClient();
  if (!admin) return null;

  const { data, error } = await supportFrom(admin, "push_subscriptions")
    .select("id, endpoint, p256dh, auth")
    .eq("user_id", recipient.userId)
    .is("disabled_at", null);
  if (error || !data || data.length === 0) return null;

  const webpush = await import("web-push");
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT!.trim(),
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!.trim(),
    process.env.VAPID_PRIVATE_KEY!.trim(),
  );

  const title = entry.in_app?.title(event, recipient) ?? "Tulala";
  const body = entry.in_app?.body?.(event, recipient) ?? "";
  const url = payloadUrl(event, entry);
  const payload = JSON.stringify({ title, body: body ?? "", url });

  let sent = 0;
  let hardFails = 0;
  for (const row of data as Array<{ id: string; endpoint: string; p256dh: string; auth: string }>) {
    try {
      await webpush.sendNotification(
        { endpoint: row.endpoint, keys: { p256dh: row.p256dh, auth: row.auth } },
        payload,
      );
      sent += 1;
      await supportFrom(admin, "push_subscriptions")
        .update({ last_success_at: new Date().toISOString() })
        .eq("id", row.id);
    } catch (err) {
      const status = (err as { statusCode?: number }).statusCode;
      if (status === 404 || status === 410) {
        await supportFrom(admin, "push_subscriptions")
          .update({ disabled_at: new Date().toISOString(), failed_at: new Date().toISOString() })
          .eq("id", row.id);
      } else {
        hardFails += 1;
        logServerError("notifications.push.send", err);
      }
    }
  }

  if (sent === 0 && hardFails > 0) {
    throw new Error("All push endpoints failed.");
  }
  if (sent === 0) return null;
  return `sent:${sent}`;
}
