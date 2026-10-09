/**
 * UI category map for the shell notification center / count bubbles (TUL-389).
 *
 * Preference categories (`lib/notifications/categories.ts`) stay as the
 * opt-in/opt-out unit. This module is the *display* bucket: Messages /
 * Money / Attention / Updates — the four chips the top-bar bubbles and
 * (later) the popover tabs use.
 *
 * Pure + client-safe: no `server-only`. Hub, scope helpers, and server
 * unread counts all import from here so the map lives in one place.
 */

/** DB `user_notifications.kind` values (CHECK constraint). */
export type NotificationKind =
  | "message"
  | "offer"
  | "booking"
  | "payment"
  | "approval"
  | "system"
  | "profile"
  | "ticket";

/** Shell UI categories for bubbles + notification center. */
export type NotificationUiCategory = "messages" | "money" | "attention" | "updates";

export const NOTIFICATION_UI_CATEGORIES: readonly NotificationUiCategory[] = [
  "messages",
  "money",
  "attention",
  "updates",
] as const;

/**
 * kind → UI category.
 *
 * - message → messages (inbox unread; also counted via messaging loaders)
 * - payment → money
 * - approval / offer / booking / ticket → attention (needs a decision or reply)
 * - system / profile → updates (informational)
 */
export const KIND_TO_UI_CATEGORY: Record<NotificationKind, NotificationUiCategory> = {
  message: "messages",
  payment: "money",
  approval: "attention",
  offer: "attention",
  booking: "attention",
  ticket: "attention",
  system: "updates",
  profile: "updates",
};

export function isNotificationKind(value: string): value is NotificationKind {
  return Object.prototype.hasOwnProperty.call(KIND_TO_UI_CATEGORY, value);
}

/** Map a DB kind to a UI category. Unknown kinds fall into `updates`. */
export function uiCategoryForKind(kind: string): NotificationUiCategory {
  if (isNotificationKind(kind)) return KIND_TO_UI_CATEGORY[kind];
  return "updates";
}

/** Kinds that roll up into one UI category (for filtered server counts). */
export function kindsForUiCategory(category: NotificationUiCategory): NotificationKind[] {
  return (Object.keys(KIND_TO_UI_CATEGORY) as NotificationKind[]).filter(
    (k) => KIND_TO_UI_CATEGORY[k] === category,
  );
}

export type UnreadNotificationCounts = {
  total: number;
  messages: number;
  money: number;
  attention: number;
  updates: number;
};

export function emptyUnreadCounts(): UnreadNotificationCounts {
  return { total: 0, messages: 0, money: 0, attention: 0, updates: 0 };
}

/** Pure rollup used by `countUnreadNotifications` and unit tests. */
export function aggregateUnreadByKind(kinds: readonly string[]): UnreadNotificationCounts {
  const counts = emptyUnreadCounts();
  for (const kind of kinds) {
    const cat = uiCategoryForKind(kind);
    counts[cat] += 1;
    counts.total += 1;
  }
  return counts;
}
