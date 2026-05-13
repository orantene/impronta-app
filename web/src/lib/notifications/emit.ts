import "server-only";

import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError } from "@/lib/server/safe-error";

/**
 * Server-side notification emitter.
 *
 * Inserts a row into `user_notifications` for the given user. The
 * `(origin_event_id, user_id)` unique index guarantees idempotency —
 * passing the same `originEventId` twice will silently no-op the second
 * call. Pass null `originEventId` for system-generated notifications
 * (welcome, plan changes) that don't trace to an inquiry event.
 *
 * Failures are logged and swallowed — notifications are best-effort, never
 * the critical path of the action that triggered them.
 */
export type EmitNotificationInput = {
  userId: string;
  tenantId: string;
  kind: "message" | "offer" | "booking" | "payment" | "approval" | "system" | "profile";
  surface: "workspace" | "talent" | "client";
  title: string;
  body?: string;
  actorUserId?: string | null;
  actorInitials?: string | null;
  targetDrawer?: string | null;
  targetPayload?: Record<string, unknown> | null;
  originEventId?: string | null;
  originKind?: string | null;
  originInquiryId?: string | null;
};

export async function emitNotification(input: EmitNotificationInput): Promise<void> {
  try {
    const admin = createServiceRoleClient();
    if (!admin) return;

    const { error } = await admin.from("user_notifications").insert({
      user_id: input.userId,
      tenant_id: input.tenantId,
      kind: input.kind,
      surface: input.surface,
      title: input.title,
      body: input.body ?? null,
      actor_user_id: input.actorUserId ?? null,
      actor_initials: input.actorInitials ?? null,
      target_drawer: input.targetDrawer ?? null,
      target_payload: input.targetPayload ?? null,
      origin_event_id: input.originEventId ?? null,
      origin_kind: input.originKind ?? null,
      origin_inquiry_id: input.originInquiryId ?? null,
    });

    // Postgres 23505 = unique_violation. Expected when an emitter retries
    // with the same origin_event_id; silently swallow.
    if (error && error.code !== "23505") {
      logServerError("notifications.emit", error);
    }
  } catch (err) {
    logServerError("notifications.emit", err);
  }
}

/**
 * Bulk variant — emits to many users at once (e.g. a new message
 * notifies every other participant). Same idempotency guarantees per
 * (originEventId, userId).
 */
export async function emitNotificationToUsers(
  userIds: string[],
  input: Omit<EmitNotificationInput, "userId">,
): Promise<void> {
  if (userIds.length === 0) return;
  await Promise.all(userIds.map((userId) => emitNotification({ ...input, userId })));
}
