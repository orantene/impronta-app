import "server-only";

import { emitNotification } from "../emit";
import type {
  AudienceContext,
  CatalogEntry,
  NotificationEvent,
  ResolvedRecipient,
} from "../types";

/**
 * In-app channel handler.
 *
 * A thin adapter over the existing `emitNotification` (which writes
 * `user_notifications` and is already idempotent on `(origin_event_id,
 * user_id)`). The dispatcher owns dedupe + preferences; this handler only
 * performs the send-effect.
 *
 * Skips when the entry has no in_app config or the recipient is a guest (no
 * account / surface to render into).
 *
 * A platform-scoped event (`tenantId = null`, e.g. a Tulala HQ alert to
 * super_admins) is written as a `platform`-surface, null-tenant row — readable
 * by the recipient through the user-scoped RLS policy and surfaced in the HQ
 * console. (user_notifications.tenant_id is nullable as of the
 * platform_in_app_notifications migration.)
 */
export async function sendInAppNotification(
  event: NotificationEvent,
  entry: CatalogEntry,
  recipient: ResolvedRecipient,
  _ctx: AudienceContext,
): Promise<void> {
  const cfg = entry.in_app;
  if (!cfg || !recipient.userId) return;

  const tenantId = event.tenantId;
  const payloadSurface = event.payload.surface;
  // The payload surface routes the row to the REQUESTER's bell (talent/client
  // surfaces have their own readers). It must apply per-recipient: a platform
  // admin receiving the same event still needs the platform surface, or the
  // HQ feed (tenant IS NULL AND surface='platform') never shows the row.
  const isRequesterRecipient =
    typeof event.userId === "string" && recipient.userId === event.userId;
  const surfaceFromPayload =
    isRequesterRecipient &&
    (payloadSurface === "workspace" ||
      payloadSurface === "talent" ||
      payloadSurface === "client")
      ? payloadSurface
      : null;

  await emitNotification({
    userId: recipient.userId,
    tenantId,
    kind: cfg.kind,
    surface: tenantId
      ? (surfaceFromPayload ?? cfg.surface)
      : surfaceFromPayload === "talent" || surfaceFromPayload === "client"
        ? surfaceFromPayload
        : "platform",
    title: cfg.title(event, recipient),
    body: cfg.body?.(event, recipient) ?? undefined,
    targetDrawer: cfg.targetDrawer ?? null,
    targetPayload: cfg.targetPayload?.(event) ?? null,
    // `origin_event_id` is a UUID column for the legacy emit.ts path's
    // inquiry-event ids. The engine's `eventId` is a composite dedupe STRING
    // (e.g. "payment-received:<txn>", "workspace-created:<tenant>"), which fails
    // the uuid cast — and emitNotification swallows the error, so the in-app row
    // is silently dropped while dispatch_log still records "sent". Idempotency
    // for engine notifications is already the dispatcher's `dedupe_key` on
    // notification_dispatch_log, so leave origin_event_id null here.
    originEventId: null,
    originKind: event.type,
    originInquiryId: event.inquiryId ?? null,
  });
}
