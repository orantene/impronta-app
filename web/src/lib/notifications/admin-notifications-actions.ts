"use server";

/**
 * Admin notifications — server actions for mark-read flows.
 *
 * Targets the `user_notifications` table (per
 * `app/(workspace)/[tenantSlug]/_data-bridge/notifications.ts` — that's
 * the canonical user-routed notifications table; the older bare
 * `notifications` table is engine-write-only via the
 * `engine_emit_notification` RPC).
 *
 * Both single-row and bulk variants ship; the bell uses the bulk one
 * for "Mark all read" and the single one when the user dismisses an
 * individual item.
 *
 * RLS already gates `user_id = auth.uid()` for SELECT and UPDATE on
 * `user_notifications` — no SECURITY DEFINER needed.
 */

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCachedActorSession } from "@/lib/server/request-cache";
import { logServerError } from "@/lib/server/safe-error";
import type { ServerActionResult } from "@/lib/server-actions/result";

export async function markAdminNotificationRead(
  notificationId: string,
): Promise<ServerActionResult> {
  const session = await getCachedActorSession();
  if (!session.user) return { ok: false, error: "Not authenticated." };

  const supabase = await createClient();
  if (!supabase) return { ok: false, error: "Database unavailable." };

  const { error } = await supabase
    .from("user_notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("id", notificationId)
    .eq("user_id", session.user.id) // belt-and-suspenders alongside RLS
    .is("read_at", null);
  if (error) {
    logServerError("admin-notifications/mark_read", error);
    return { ok: false, error: error.message };
  }

  return { ok: true, data: undefined };
}

export async function markAllAdminNotificationsRead(): Promise<ServerActionResult<{ count: number }>> {
  const session = await getCachedActorSession();
  if (!session.user) return { ok: false, error: "Not authenticated." };

  const supabase = await createClient();
  if (!supabase) return { ok: false, error: "Database unavailable." };

  const { data, error } = await supabase
    .from("user_notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("user_id", session.user.id)
    .is("read_at", null)
    .select("id");
  if (error) {
    logServerError("admin-notifications/mark_all_read", error);
    return { ok: false, error: error.message };
  }

  // Revalidate the admin layout so the next render shows the cleared count.
  // Path is intentionally broad — every admin layout reads notif count.
  revalidatePath("/", "layout");

  return { ok: true, data: { count: data?.length ?? 0 } };
}
