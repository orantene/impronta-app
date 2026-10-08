/**
 * TUL-390 — pure helpers for the bell popover: category tabs, dual-owner
 * surface tabs, and the >8 → "See all" drawer threshold.
 *
 * Kind→category mapping mirrors `lib/notifications/categories-ui.ts` (TUL-389)
 * so this PR can land in parallel without stacking. When 389 merges, prefer
 * importing `uiCategoryForKind` from that module and delete the local map.
 */

export type HubUiCategory = "messages" | "money" | "attention" | "updates";

export type HubOwnerSurface = "admin" | "talent";

/** Popover shows at most this many rows; beyond that, "See all" opens the drawer. */
export const POPOVER_LIST_LIMIT = 8;

export const HUB_UI_CATEGORIES: readonly HubUiCategory[] = [
  "messages",
  "money",
  "attention",
  "updates",
] as const;

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

const KIND_TO_CATEGORY: Record<string, HubUiCategory> = {
  message: "messages",
  payment: "money",
  approval: "attention",
  offer: "attention",
  booking: "attention",
  ticket: "attention",
  system: "updates",
  profile: "updates",
};

/** Map a DB kind (or hub bucket fallback) to a UI category. */
export function hubUiCategoryForKind(kind: string | undefined | null): HubUiCategory {
  if (kind && KIND_TO_CATEGORY[kind]) return KIND_TO_CATEGORY[kind];
  return "updates";
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
};

/** True when the filtered list is long enough to warrant the full drawer. */
export function shouldShowSeeAllNotifications(filteredCount: number): boolean {
  return filteredCount > POPOVER_LIST_LIMIT;
}

/** Rows rendered inside the popover (cap at POPOVER_LIST_LIMIT). */
export function popoverPreviewItems<T>(items: readonly T[]): T[] {
  return items.slice(0, POPOVER_LIST_LIMIT);
}

export function filterHubItemsByCategory<T extends { category: HubUiCategory }>(
  items: readonly T[],
  category: HubUiCategory | "all",
): T[] {
  if (category === "all") return [...items];
  return items.filter((i) => i.category === category);
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
): { visible: T[]; filteredCount: number; showSeeAll: boolean } {
  const byOwner = filterHubItemsByOwner(items, opts.owner);
  const filtered = filterHubItemsByCategory(byOwner, opts.category);
  return {
    visible: popoverPreviewItems(filtered),
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
  return hubUiCategoryForKind(kind) === category;
}
