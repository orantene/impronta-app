/**
 * notification-hub-scope.ts: pure rules for what the bell popover may show
 * and where a real row's click goes. Kept out of the React file so both rules
 * are testable in a plain node lane.
 *
 * F71: the popover used to append `pendingTalent` (a workspace staff queue,
 * fixture data on some builds) and the plan-cap nudge on EVERY surface, so a
 * solo talent saw "Sofia Lupo, pending approval" for people she has never
 * met. Staff queues belong to the workspace surface only.
 *
 * F72: real rows rendered with no `cta`, so clicking "Maison v2 has an update"
 * did nothing. Every row with a stored destination now resolves through the
 * shared target resolver (`notificationDrawerFields`), the same one the talent
 * notifications drawer uses.
 */

import type { UserNotification } from "./data-bridge";
import type { DrawerId } from "./state/drawer-ids";
import { notificationDrawerFields } from "./notification-drawer-targets";
import { targetOf } from "./talent-notification-rows";
import {
  uiCategoryForKind,
  type NotificationUiCategory,
} from "@/lib/notifications/categories-ui";

export type HubSurface = "workspace" | "talent" | "client";
export type { NotificationUiCategory };

/** Staff/agency queues (pending approvals, plan cap) are workspace-only. */
export function staffQueuesVisible(surface: HubSurface): boolean {
  return surface === "workspace";
}

/** On the talent surface only rows addressed to the talent surface show. */
export function scopeRealNotifications(
  rows: readonly UserNotification[],
  surface: HubSurface,
): UserNotification[] {
  return surface === "talent" ? rows.filter((n) => n.surface === "talent") : [...rows];
}

/** Filter scoped rows to one UI category (bubble click / popover tab). */
export function filterNotificationsByUiCategory(
  rows: readonly UserNotification[],
  category: NotificationUiCategory,
): UserNotification[] {
  return rows.filter((n) => uiCategoryForKind(n.kind) === category);
}

/**
 * Unread among real rows: `read` is the server `read_at` mapping from the
 * data-bridge. Optimistic ids (just-marked in the hub) are treated as read
 * so the badge clears before the next layout reload.
 */
export function countUnreadRealNotifications(
  rows: readonly UserNotification[],
  optimisticReadIds: ReadonlySet<string> = new Set(),
): number {
  return rows.reduce((n, row) => {
    if (row.read || optimisticReadIds.has(row.id) || optimisticReadIds.has(`notif-${row.id}`)) {
      return n;
    }
    return n + 1;
  }, 0);
}

export type HubClickTarget =
  | { kind: "href"; href: string }
  | { kind: "drawer"; drawerId: DrawerId; payload: Record<string, unknown> | undefined };

/** Where a real row's click lands; null when the row has no stored destination. */
export function hubClickTarget(n: UserNotification, adminBasePath: string): HubClickTarget | null {
  const raw = targetOf(n);
  if (!raw) return null;
  const f = notificationDrawerFields(raw, n.originInquiryId, adminBasePath);
  if (f.targetHref) return { kind: "href", href: f.targetHref };
  return { kind: "drawer", drawerId: f.targetDrawer, payload: f.targetPayload };
}
