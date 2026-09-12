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
