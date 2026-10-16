/**
 * Pages whose body is a REAL SERVER ROUTE hosted inside the shell's <main>
 * (canonical-route-children.tsx), not an SPA page-module.
 *
 * TUL-672. A rail click flips the shell's page state at once, but the route
 * (and with it the canonical-children context) only commits when the server
 * has rendered it. In that gap PageRouter has no body of its own for these
 * pages: the old page, a blank, or (for `projects`) the Messages page showed.
 * PageRouter renders the page skeleton for them instead, so the click always
 * answers at once and the body can never be a different page.
 *
 * Deliberately an explicit list, not "every canonical destination":
 * `people`, `roster` and `payouts` are canonical or aliased in the registry
 * but still have an SPA body that must keep rendering.
 */
const SERVER_ROUTE_PAGES: ReadonlySet<string> = new Set([
  "orders",
  "projects",
  "issues",
  "exceptions",
  "sales",
]);

export function pageIsServerRoute(page: string): boolean {
  return SERVER_ROUTE_PAGES.has(page);
}
