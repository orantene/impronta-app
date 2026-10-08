/**
 * UI category buckets for the shell bell / ShellCountBubbles (TUL-389).
 *
 * Preference categories (`categories.ts`) stay opt-in prefs. These four are
 * the count-bubble groups: Messages · Money · Attention · Updates.
 */

export type NotifUiCategory = "messages" | "money" | "attention" | "updates";

/** `user_notifications.kind` CHECK values. */
export type UserNotificationKind =
  | "message"
  | "offer"
  | "booking"
  | "payment"
  | "approval"
  | "system"
  | "profile"
  | "ticket";

/**
 * kind → UI category.
 * - messages: chat / thread traffic
 * - money: payments & payouts
 * - attention: approvals / offers that need a decision
 * - updates: everything else (booking, profile, ticket, system)
 */
export function categoryForKind(kind: string): NotifUiCategory {
  switch (kind) {
    case "message":
      return "messages";
    case "payment":
      return "money";
    case "approval":
    case "offer":
      return "attention";
    case "booking":
    case "profile":
    case "ticket":
    case "system":
    default:
      return "updates";
  }
}

function rowIsUnread(r: { readAt?: string | null; read?: boolean }): boolean {
  if (typeof r.read === "boolean") return !r.read;
  return r.readAt == null;
}

/** Group unread rows by UI category (for shell bubbles). */
export function countUnreadByCategory(
  rows: ReadonlyArray<{ kind: string; readAt?: string | null; read?: boolean }>,
): Record<NotifUiCategory, number> {
  const out: Record<NotifUiCategory, number> = {
    messages: 0,
    money: 0,
    attention: 0,
    updates: 0,
  };
  for (const r of rows) {
    if (!rowIsUnread(r)) continue;
    out[categoryForKind(r.kind)] += 1;
  }
  return out;
}
