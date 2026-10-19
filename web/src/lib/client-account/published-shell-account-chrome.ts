/**
 * Render-time client-account chrome for agency PublishedShell headers (TUL-158).
 * Mirrors talent's withAccountItem + siteChrome.account pair. Never writes to DB.
 */

import { resolveClientAccountMount } from "./gate";

type RegionItem = { type?: string; [key: string]: unknown };

/** Insert `{ type: "account" }` after the first `language` item in header regions. Idempotent. */
export function withAccountRegionItem(
  props: Record<string, unknown>,
): Record<string, unknown> {
  const regions = props.regions;
  if (!regions || typeof regions !== "object" || Array.isArray(regions)) return props;
  const source = regions as Record<string, unknown>;
  const hasAccount = Object.values(source).some(
    (items) =>
      Array.isArray(items) &&
      items.some((i) => (i as RegionItem | null)?.type === "account"),
  );
  if (hasAccount) return props;
  const out: Record<string, unknown> = {};
  let done = false;
  for (const [zone, items] of Object.entries(source)) {
    if (!Array.isArray(items)) {
      out[zone] = items;
      continue;
    }
    const at = items.findIndex((i) => (i as RegionItem | null)?.type === "language");
    if (!done && at >= 0) {
      out[zone] = [
        ...items.slice(0, at + 1),
        { type: "account", responsive: { mobile: "show" } },
        ...items.slice(at + 1),
      ];
      done = true;
    } else {
      out[zone] = items;
    }
  }
  return { ...props, regions: out };
}

/**
 * Agency / hub / app storefront headers: when the `app` client-account flag is
 * on, inject the freeform `account` region item and flip `siteChrome.account`
 * so `HeaderAccountItem` → `ClientAccountButton` paints. Flag off: props unchanged.
 */
export function withPublishedShellAccountChrome(
  sectionTypeKey: string,
  props: Record<string, unknown>,
): Record<string, unknown> {
  if (sectionTypeKey !== "site_header") return props;
  if (!resolveClientAccountMount("app").headerItem) return props;
  const withItem = withAccountRegionItem(props);
  const prevChrome =
    withItem.siteChrome && typeof withItem.siteChrome === "object" && !Array.isArray(withItem.siteChrome)
      ? (withItem.siteChrome as Record<string, unknown>)
      : {};
  return {
    ...withItem,
    siteChrome: { ...prevChrome, account: true },
  };
}
