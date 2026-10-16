/**
 * Business workspaces 404 on `/directory` (assertRosterWorkspace). Header
 * nav, CTAs, and inquiry/saved fallbacks must not point there when the
 * workspace has no roster. Pure helpers for SiteHeaderComponent.
 */

/** True when `href` is (or resolves to) the tenant directory browse path. */
export function isDirectoryHref(href: string | null | undefined): boolean {
  if (!href) return false;
  try {
    const path = href.startsWith("http")
      ? new URL(href).pathname
      : href.split(/[?#]/)[0] ?? href;
    const normalized = path.replace(/\/+$/, "") || "/";
    // Locale prefix: /es/directory, /en/directory, or bare /directory.
    return /(?:^|\/)directory$/.test(normalized);
  } catch {
    return false;
  }
}

/**
 * Inquiry / CTA fallback when the header item has no explicit href.
 * Roster workspaces keep `/directory`; business workspaces use `/book`.
 */
export function directoryOrBookHref(hasRoster: boolean): string {
  return hasRoster ? "/directory" : "/book";
}

/**
 * Drop nav items that would 404 on a business workspace. Agency / talent
 * workspaces keep every link. Does not mutate `items`.
 */
export function filterNavItemsForRoster<T extends { href?: string | null }>(
  items: readonly T[],
  hasRoster: boolean,
): T[] {
  if (hasRoster) return items.slice();
  return items.filter((item) => !isDirectoryHref(item.href ?? undefined));
}

/**
 * Resolve a header CTA / inquiry / saved href: when the workspace has no
 * roster, rewrite directory targets to `/book` (or the given fallback).
 */
export function resolveRosterSafeHref(
  href: string | null | undefined,
  hasRoster: boolean,
  fallback?: string,
): string {
  const raw = href ?? fallback ?? directoryOrBookHref(hasRoster);
  if (!hasRoster && isDirectoryHref(raw)) return directoryOrBookHref(false);
  return raw;
}
