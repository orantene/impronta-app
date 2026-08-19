// Pure types + helpers for the Website sub-nav config. Split out of
// website-nav.ts (which is "use client" and pulls in useAdminShell/React)
// so this piece stays importable from a plain node:test run — see
// website-nav.test.ts.

import type { AdminShellIconName } from "../primitives";

export interface WebsiteSubnavItem {
  /** Stable identifier — routing key, React key, active-state comparisons. */
  id:
    | "overview"
    | "pages"
    | "posts"
    | "design"
    | "card-design"
    | "profile-pages"
    | "redirects"
    | "setup"
    | "forms";
  /** EN literal — consumed by the sidebar's `copy.t()` (dashboard-i18n ES_TEXT). */
  label: string;
  /** Catalog key for the dropdown/mobile `useT()` label. */
  i18nKey: string;
  /** Catalog key for the dropdown's secondary description line. */
  descriptionI18nKey: string;
  href: string;
  /** Opens in a new tab instead of routing (the visual editor is the storefront). */
  external?: boolean;
  icon: AdminShellIconName;
  count?: number;
}

/** Pure helper — the non-external subset, used by the mobile pill strip. */
export function internalWebsiteSubnavItems(items: WebsiteSubnavItem[]): WebsiteSubnavItem[] {
  return items.filter((item) => !item.external);
}
