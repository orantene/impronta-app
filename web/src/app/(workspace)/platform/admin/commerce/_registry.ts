/**
 * _registry.ts — the Commerce tab set, defined once.
 *
 * Before this, every HQ tab strip carried its own hardcoded union plus a
 * matching switch plus a label lookup, edited in two or three places whenever a
 * tab moved. Commerce absorbs five previously-separate surfaces, so the union
 * would have been the most-edited line on the page. Here it is data: add a row,
 * and the strip, the URL parser and the body switch all follow.
 *
 * Shared by server components only (`_header.tsx`, `page.tsx`, `tab-body.tsx`),
 * so it stays a plain module with no "use client" and no React import.
 */

export const COMMERCE_TABS = [
  { id: "health", labelKey: "dashboard.platform.commerce.tabs.health" },
  { id: "catalog", labelKey: "dashboard.platform.commerce.tabs.catalog" },
  { id: "discounts", labelKey: "dashboard.platform.commerce.tabs.discounts" },
  { id: "revenue", labelKey: "dashboard.platform.commerce.tabs.revenue" },
  { id: "commission", labelKey: "dashboard.platform.commerce.tabs.commission" },
  { id: "entitlements", labelKey: "dashboard.platform.commerce.tabs.entitlements" },
] as const;

export type CommerceTab = (typeof COMMERCE_TABS)[number]["id"];

/**
 * Default tab: health. The question "is our billing wired right" is the one
 * worth answering before any number on the other tabs can be trusted.
 */
export const DEFAULT_COMMERCE_TAB: CommerceTab = "health";

const TAB_IDS = new Set<string>(COMMERCE_TABS.map((t) => t.id));

/** Anything unrecognised (or absent) falls back to the default tab. */
export function parseCommerceTab(raw: string | string[] | undefined): CommerceTab {
  const value = Array.isArray(raw) ? raw[0] : raw;
  return value && TAB_IDS.has(value)
    ? (value as CommerceTab)
    : DEFAULT_COMMERCE_TAB;
}

export const COMMERCE_PATH = "/platform/admin/commerce";

/**
 * Tab links deliberately carry ONLY `?tab=` — no `?d=`. Switching tabs
 * therefore closes any open drawer for free, with no client state to reset.
 */
export function commerceTabHref(tab: CommerceTab): string {
  return `${COMMERCE_PATH}?tab=${tab}`;
}
