/**
 * Notification dispatch — stable alias for the documented path.
 *
 * This used to be a no-op stub. The real engine now lives in
 * `@/lib/notifications/dispatcher` (catalog → audience → prefs → dedupe log →
 * channel handlers). This module re-exports it so existing references to the
 * `server-actions/notification-dispatch` path keep resolving.
 *
 * NOTE: this is intentionally NOT a `"use server"` client-callable action.
 * Dispatch must only be triggered server-side — by the inquiry engine
 * (Phase 5) or cron jobs — never from the client with a caller-supplied
 * event. Server-side callers should import `dispatchEventNotifications`
 * from `@/lib/notifications/dispatcher` directly.
 */

export {
  dispatchEventNotifications,
  dispatchEventNotifications as dispatchNotification,
} from "@/lib/notifications/dispatcher";
export type { DispatchResult, NotificationEvent } from "@/lib/notifications/types";
