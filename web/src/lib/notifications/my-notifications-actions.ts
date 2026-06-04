"use server";

/**
 * Shared notification server actions — consumed by the admin top-bar bell, the
 * talent bell, and the client shell. These are the loadMyNotifications /
 * markNotificationsRead contracts that the role shells reference.
 *
 * Implementation is the canonical `@/lib/notifications/self` (single source of
 * truth): it reads `user_notifications` scoped to `auth.uid()` via RLS and
 * computes a per-role deep-link `href` for each row. This module stays as a
 * thin, backward-compatible wrapper so existing imports keep working.
 */

import {
  loadMyNotifications as loadMyNotificationsImpl,
  markNotificationsRead as markNotificationsReadImpl,
} from "@/lib/notifications/self";
import type { MyNotification } from "@/lib/notifications/self-types";

/**
 * Load the calling user's most recent notifications across all tenants /
 * surfaces, newest-first. The optional second arg is accepted for backward
 * compatibility with callers that used to pass a tenant slug — it is ignored
 * now that the slug is resolved internally per-row.
 */
export async function loadMyNotifications(
  limit?: number,
  _tenantSlug?: string,
): Promise<MyNotification[]> {
  return loadMyNotificationsImpl(limit);
}

/**
 * Mark one or many notification rows read for the calling user. Passing `'all'`
 * marks every unread row for this user.
 */
export async function markNotificationsRead(
  ids: string[] | "all",
): Promise<{ ok: boolean }> {
  return markNotificationsReadImpl(ids);
}
