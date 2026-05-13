"use server";

import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { logServerError } from "@/lib/server/safe-error";

/**
 * Mark a single notification as read for the calling user.
 * Idempotent — no-op if already read.
 */
export async function markNotificationRead(
  notificationId: string,
): Promise<{ ok: boolean }> {
  try {
    const supabase = await createSupabaseServerClient();
    if (!supabase) return { ok: false };
    const { error } = await supabase.rpc("user_notifications_mark_read", {
      p_notification_id: notificationId,
    });
    if (error) {
      logServerError("notifications.markRead", error);
      return { ok: false };
    }
    return { ok: true };
  } catch (err) {
    logServerError("notifications.markRead", err);
    return { ok: false };
  }
}

/**
 * Mark all unread notifications for the calling user in a tenant as read.
 * Returns the number of rows updated.
 */
export async function markAllNotificationsRead(
  tenantId: string,
): Promise<{ ok: boolean; count: number }> {
  try {
    const supabase = await createSupabaseServerClient();
    if (!supabase) return { ok: false, count: 0 };
    const { data, error } = await supabase.rpc("user_notifications_mark_all_read", {
      p_tenant_id: tenantId,
    });
    if (error) {
      logServerError("notifications.markAllRead", error);
      return { ok: false, count: 0 };
    }
    return { ok: true, count: typeof data === "number" ? data : 0 };
  } catch (err) {
    logServerError("notifications.markAllRead", err);
    return { ok: false, count: 0 };
  }
}
