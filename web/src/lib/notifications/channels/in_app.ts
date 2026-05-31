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
 * Skips when:
 *  - the entry has no in_app config,
 *  - the recipient is a guest (no account / surface to render into),
 *  - the event has no tenant scope (`user_notifications.tenant_id` is
 *    NOT NULL — platform-scoped in-app notifications are a Phase 6+ concern).
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
  if (!tenantId) return;

  await emitNotification({
    userId: recipient.userId,
    tenantId,
    kind: cfg.kind,
    surface: cfg.surface,
    title: cfg.title(event, recipient),
    body: cfg.body?.(event, recipient) ?? undefined,
    targetDrawer: cfg.targetDrawer ?? null,
    targetPayload: cfg.targetPayload?.(event) ?? null,
    originEventId: event.eventId,
    originKind: event.type,
    originInquiryId: event.inquiryId ?? null,
  });
}
