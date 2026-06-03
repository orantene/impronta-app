"use server";

/**
 * Server-action surface for the shared notifications CONTRACT.
 *
 * The shells (client / talent / admin) import these directly. They are thin
 * `"use server"` wrappers over `@/lib/notifications/self` so the heavy module
 * (which imports `server-only`) is never pulled into a client bundle.
 */

import {
  loadMyNotifications as loadMyNotificationsImpl,
  markNotificationsRead as markNotificationsReadImpl,
} from "@/lib/notifications/self";
import type { MyNotification } from "@/lib/notifications/self-types";

export async function loadMyNotifications(limit?: number): Promise<MyNotification[]> {
  return loadMyNotificationsImpl(limit);
}

export async function markNotificationsRead(
  ids: string[] | "all",
): Promise<{ ok: boolean }> {
  return markNotificationsReadImpl(ids);
}
