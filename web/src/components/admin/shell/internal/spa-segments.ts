/**
 * Admin URL segments whose `page.tsx` is a bare `PageRouteSyncer`: the server
 * renders nothing for them that the shell does not already have, so a rail
 * click to one of them is a `history.pushState`, not a `router.push`.
 *
 * WHY. `router.push` asks the server for the route's RSC payload. For these
 * segments that payload is a few hundred bytes, but the request still goes
 * through the proxy (host lookup, locale, session) and a function invocation
 * before the shell, which had ALREADY switched the page, hears back. On the
 * deployed host that was 0.3-3.9 s per rail click for nothing. The native
 * History API integrates with the Next.js router (`usePathname` follows it),
 * so the URL stays the source of truth and Back/Forward keep working through
 * `useUrlPageSync` (use-url-page-sync.ts), called from WorkspaceShell.
 *
 * A segment whose page does real server work (the overview snapshot, POS,
 * orders, sales, settings sub-routes with server pages...) is NOT here and
 * keeps `router.push`. `spa-segments.static.test.ts` pins every entry to a
 * page file that contains `PageRouteSyncer` and no `await`, so a page that
 * grows server work drops out of this list or fails the gate.
 */
export const SPA_ONLY_ADMIN_SEGMENTS = [
  "analytics",
  "appointments",
  "appts",
  "calendar",
  "catalog",
  "clients",
  "events",
  "media",
  "menu",
  "messages",
  "operations",
  "payouts",
  "pitches",
  "production",
  "reviews",
  "roster",
  "sessions",
  "settings",
  "site",
  "website",
] as const;

const SPA_ONLY = new Set<string>(SPA_ONLY_ADMIN_SEGMENTS);

export function isSpaOnlyAdminSegment(segment: string): boolean {
  return SPA_ONLY.has(segment);
}

/**
 * Whether the route the shell is currently on renders NOTHING of its own:
 * the admin base itself (the overview page fills a store and draws nothing)
 * or exactly one SPA-only segment under it. Only then may a rail click move
 * the URL with `history.pushState`.
 *
 * WHY THIS IS A PRECONDITION (D-167). The pushState shortcut skips the server
 * round trip, so the Next.js route tree keeps the CURRENT page's content;
 * only `usePathname` moves. That is harmless when the current page is a bare
 * `PageRouteSyncer`, and wrong when it is a canonical server page such as
 * /admin/projects: `AdminShellClient` hosts a canonical page inside the
 * shell's `<main>` by the pathname, so when the pathname stopped matching,
 * the still-mounted Projects tree fell out of its slot and was re-mounted
 * inline BEFORE `.tulala-shell`, a ghost list above the header that survived
 * every SPA-only click after it and only cleared on the next real
 * `router.push`. Leaving anything else than a bare shell route therefore
 * goes through the router, which replaces the route content.
 */
export function isBareShellPath(pathname: string, adminBase: string): boolean {
  const path = pathname.replace(/\/+$/, "");
  if (path === adminBase) return true;
  if (!path.startsWith(`${adminBase}/`)) return false;
  const rest = path.slice(adminBase.length + 1);
  return rest.length > 0 && !rest.includes("/") && SPA_ONLY.has(rest);
}
