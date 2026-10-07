/**
 * Pure rule: the talent bell only counts notifications she can open.
 *
 * Messages lists the conversations she can see (tenant scope, participant,
 * QA fixtures hidden). A conversation notification that points at a thread
 * outside that list is an orphan: counting it made the bell say 25 unread
 * while Messages showed 0 (TUL-52 B). Rows with no thread that are not
 * conversation kinds (theme update, payout notice) are kept.
 */

import type { UserNotification } from "@/app/(workspace)/[tenantSlug]/_data-bridge/notifications";

const THREAD_KINDS: ReadonlySet<UserNotification["kind"]> = new Set(["message", "offer"]);

type Scopable = Pick<UserNotification, "kind" | "originInquiryId">;

export function scopeTalentNotificationsToInbox<T extends Scopable>(
  rows: readonly T[],
  visibleInquiryIds: ReadonlySet<string> | null,
): T[] {
  // Visibility unknown (load failed): do not hide anything.
  if (!visibleInquiryIds) return [...rows];
  return rows.filter((n) => {
    if (n.originInquiryId) return visibleInquiryIds.has(n.originInquiryId);
    return !THREAD_KINDS.has(n.kind);
  });
}

/** Unread conversation notifications the talent can open. */
export function unreadConversationNotificationCount<T extends Scopable & { read: boolean }>(
  rows: readonly T[],
  visibleInquiryIds: ReadonlySet<string> | null,
): number {
  return scopeTalentNotificationsToInbox(rows, visibleInquiryIds).filter((n) => !n.read).length;
}
