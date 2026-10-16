/**
 * TUL-390 — pure helpers for the bell popover: category tabs, dual-owner
 * surface tabs, and the >8 → "See all" drawer threshold.
 *
 * Kind→category uses `lib/notifications/categories-ui.ts` (TUL-389 on main).
 */

import {
  NOTIFICATION_UI_CATEGORIES,
  uiCategoryForKind,
  type NotificationUiCategory,
} from "@/lib/notifications/categories-ui";

export type HubUiCategory = NotificationUiCategory;

export type HubOwnerSurface = "admin" | "talent";

/** Popover shows at most this many rows; beyond that, "See all" opens the drawer. */
export const POPOVER_LIST_LIMIT = 8;

export const HUB_UI_CATEGORIES: readonly HubUiCategory[] = NOTIFICATION_UI_CATEGORIES;

/** English labels for category tabs (dashboard-i18n keys). */
export const HUB_CATEGORY_LABEL: Record<HubUiCategory, string> = {
  messages: "Messages",
  money: "Money",
  attention: "Attention",
  updates: "Updates",
};

/** English labels for dual-owner surface tabs. */
export const HUB_OWNER_LABEL: Record<HubOwnerSurface, string> = {
  admin: "Admin",
  talent: "Talent",
};

/** Map a DB kind (or hub bucket fallback) to a UI category. */
export function hubUiCategoryForKind(kind: string | undefined | null): HubUiCategory {
  if (!kind) return "updates";
  return uiCategoryForKind(kind);
}

/** Legacy hub buckets → UI category (fixture / derived rows without a kind). */
export function hubUiCategoryForBucket(
  bucket: "action" | "update" | "system",
): HubUiCategory {
  if (bucket === "action") return "attention";
  if (bucket === "system") return "updates";
  return "messages";
}

export type HubPopoverItem = {
  id: string;
  category: HubUiCategory;
  /** admin = workspace staff queues / workspace-surfaced rows; talent = talent surface. */
  owner: HubOwnerSurface;
  /** DB kind when the row has one; lets a row sit in more than one tab. */
  kind?: string;
};

/**
 * Display-only: an `offer` row carries an amount, so it also lists under Money
 * (it stays under Attention too). Counts and the kind map are unchanged.
 */
export function hubKindInCategory(kind: string, category: HubUiCategory): boolean {
  return hubUiCategoryForKind(kind) === category || (category === "money" && kind === "offer");
}

/**
 * Number shown in a list header: unread rows among the filtered list, so it
 * matches the bell badge ("7 unread"); all rows when none are unread. Never
 * the 8-row preview cap.
 */
export function hubSectionCount(
  filtered: readonly { id: string }[],
  readIds: ReadonlySet<string>,
): number {
  const unread = filtered.filter((i) => !readIds.has(i.id)).length;
  return unread > 0 ? unread : filtered.length;
}

/** True when the filtered list is long enough to warrant the full drawer. */
export function shouldShowSeeAllNotifications(filteredCount: number): boolean {
  return filteredCount > POPOVER_LIST_LIMIT;
}

/** Rows rendered inside the popover (cap at POPOVER_LIST_LIMIT). */
export function popoverPreviewItems<T>(items: readonly T[]): T[] {
  return items.slice(0, POPOVER_LIST_LIMIT);
}

export function filterHubItemsByCategory<T extends { category: HubUiCategory; kind?: string }>(
  items: readonly T[],
  category: HubUiCategory | "all",
): T[] {
  if (category === "all") return [...items];
  return items.filter((i) => i.category === category || (i.kind ? hubKindInCategory(i.kind, category) : false));
}

export function filterHubItemsByOwner<T extends { owner: HubOwnerSurface }>(
  items: readonly T[],
  owner: HubOwnerSurface | "all",
): T[] {
  if (owner === "all") return [...items];
  return items.filter((i) => i.owner === owner);
}

/**
 * Apply owner + category filters, then decide preview vs see-all.
 * Pure so threshold 8 vs 9 is unit-tested without React.
 */
export function selectPopoverList<T extends HubPopoverItem>(
  items: readonly T[],
  opts: {
    category: HubUiCategory | "all";
    owner: HubOwnerSurface | "all";
  },
): { visible: T[]; filtered: T[]; filteredCount: number; showSeeAll: boolean } {
  const byOwner = filterHubItemsByOwner(items, opts.owner);
  const filtered = filterHubItemsByCategory(byOwner, opts.category);
  return {
    visible: popoverPreviewItems(filtered),
    filtered,
    filteredCount: filtered.length,
    showSeeAll: shouldShowSeeAllNotifications(filtered.length),
  };
}

/** Drawer id for the full notification center on each shell surface. */
export function notificationCenterDrawerId(
  surface: "workspace" | "talent" | "client",
): "notifications" | "talent-notifications" {
  return surface === "talent" ? "talent-notifications" : "notifications";
}

/**
 * Drawer payload `{ category }` from bell "See all" / count bubbles.
 * `null` / unknown → keep row; known HubUiCategory → kind must match.
 */
export function matchesHubPayloadCategory(
  kind: string,
  category: string | null | undefined,
): boolean {
  if (!category) return true;
  if (!(HUB_UI_CATEGORIES as readonly string[]).includes(category)) return true;
  return hubKindInCategory(kind, category as HubUiCategory);
}
