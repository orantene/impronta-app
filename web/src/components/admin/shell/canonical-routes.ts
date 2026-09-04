/**
 * Canonical-route routing for the workspace admin shell.
 *
 * Extracted from `admin-shell-client.tsx` (2026-08-06) so the host-shape logic
 * is unit-testable without mounting the client shell — the branded-host bug
 * below shipped precisely because nothing covered it.
 */

/**
 * Route patterns that should render the canonical Next.js page (children)
 * INSTEAD of the prototype SPA. Matched against `usePathname()` segments
 * after the tenant slug. Add new patterns here when a canonical page is
 * ready to be reachable via direct URL navigation.
 *
 * Each pattern is a function from path-segments-after-tenant → boolean.
 * The tenant slug itself isn't passed (it's variable across workspaces).
 */
export const CANONICAL_ROUTE_MATCHERS: Array<(segments: string[]) => boolean> = [
  // /<tenant>/admin/work/<id> — canonical booking detail w/ payment state machine
  (s) => s[0] === "admin" && s[1] === "work" && typeof s[2] === "string" && s[2].length > 0,
  // /<tenant>/admin/policy/<…> — workspace policy pages (auto-ack, etc.)
  // rendered as standalone server components, not via the prototype SPA.
  (s) => s[0] === "admin" && s[1] === "policy",
  // /<tenant>/admin/discover-performance — A9 Discover analytics dashboard.
  (s) => s[0] === "admin" && s[1] === "discover-performance",
  // /<tenant>/admin/activity-log — Workspace Activity Log (unified per-tenant
  // audit trail: who changed what, when, from where).
  (s) => s[0] === "admin" && s[1] === "activity-log",
  // /<tenant>/admin/discover-inquiries — Discover-routed inquiry list with
  // source / status / trust filter chips. Real server component, not the
  // prototype SPA.
  (s) => s[0] === "admin" && s[1] === "discover-inquiries",
  // /<tenant>/admin/settings/discover — A7 Discover benefits + enrollment
  // panel. Standalone (no Settings shell extraction needed).
  (s) => s[0] === "admin" && s[1] === "settings" && s[2] === "discover",
  // /<tenant>/talent/trust — T7 Trust signals sub-page. Standalone
  // server component (talent.tsx mega-shell stays untouched). The
  // talent shell now uses ConditionalAdminShellRoot so this yields.
  (s) => s[0] === "talent" && s[1] === "trust",
  // /<tenant>/talent/discover — T2+T4+T5 Discover control panel
  // (card preview + travel reach + 30-day stats). Standalone server
  // component; talent.tsx mega-shell untouched.
  (s) => s[0] === "talent" && s[1] === "discover",
  // /<tenant>/talent/site — personal site dashboard renders inside the
  // talent shell (public-page tab), not as a standalone canonical page.
  // /<tenant>/admin/roster/** — Phase 2.2: the entire Roster surface is
  // now canonical. List (no id segment) is the new server-rendered grid;
  // [id] edit page + [id]/commission (A8) + /new were already real pages
  // the prototype SPA was overlaying. Blanket match retires roster from
  // the mega shell.
  // /<tenant>/admin/roster/** — NO canonical matcher. The entire
  // Roster surface (list, [id], new) renders via the original
  // prototype-SPA shell — that page was already completed + approved.
  // Reverted 2026-05-15 per product owner: all canonical-migration
  // routing for Roster removed. The Phase-2.2 server pages
  // (admin/roster/page.tsx etc.) stay in the tree but are inert —
  // the SPA overlays them. Do NOT re-add a roster matcher without
  // explicit owner sign-off.
  // /<tenant>/admin/triage — focused queue (separate from Messages shell).
  (s) => s[0] === "admin" && s[1] === "triage",
  // /<tenant>/admin/financials — Business Financials page (L46).
  (s) => s[0] === "admin" && s[1] === "financials",
  // /<tenant>/admin/orders — the Orders desk (0.10). Canonical server route
  // like `financials`, not a prototype SPA tab: it reads `orders` directly and
  // has no shell data-bridge projection to hang off.
  (s) => s[0] === "admin" && s[1] === "orders",
  // /<tenant>/admin/reviews/** — WP1. The review-photo moderation grid at
  // /admin/reviews/media is a real server page; the new Reviews page-module
  // links to it. Without this matcher it rendered without shell chrome /
  // stacked under the SPA (the same failure the bookings matcher fixed).
  (s) => s[0] === "admin" && s[1] === "reviews" && s[2] === "media",
  // /<tenant>/admin/bookings/** + /admin/account — these server pages have
  // no SPA counterpart ("bookings"/"account" are not WorkspacePage ids), so
  // without a matcher the route rendered BOTH the server page and the SPA
  // overview stacked on one screen. Yield to the real page.
  (s) => s[0] === "admin" && s[1] === "bookings",
  (s) => s[0] === "admin" && s[1] === "account",
  // /<tenant>/admin/roster/applications — apply-flow inbox (L48).
  (s) => s[0] === "admin" && s[1] === "roster" && s[2] === "applications",
  // /<tenant>/admin/roster/registration — Tenant Registration Engine settings.
  (s) => s[0] === "admin" && s[1] === "roster" && s[2] === "registration",
  // /<tenant>/admin/roster/rates — bulk day-rate editor. Without this matcher
  // the page rendered naked (no sidebar/top bar) with the SPA roster stacked
  // behind it — same failure class the bookings/account matchers fixed.
  (s) => s[0] === "admin" && s[1] === "roster" && s[2] === "rates",
  // /talent/discover-agencies — apply-flow discovery page (L48). Talent-scoped
  // (no tenant slug — matched against the full segments because the platform
  // talent path starts with "talent").
  (s) => s[0] === "talent" && s[1] === "discover-agencies",
  // NOTE: talent payouts is an IN-SHELL SPA section (TalentPage "payouts" →
  // /talent/payouts), NOT a canonical route — it renders inside the talent
  // dashboard nav (and works on agency hosts, unlike standalone /talent/*
  // routes which loop there). Intentionally no matcher here.
  // /<tenant>/admin/website/redirects — 301/302 manager. "website" IS a
  // WorkspacePage id, so without this matcher the SPA's Website overview would
  // render stacked underneath the real page (the failure the bookings/account
  // matchers below were added for).
  (s) => s[0] === "admin" && s[1] === "website" && s[2] === "redirects",
  // /<tenant>/admin/messages/<id> — Phase 2.1 canonical thread inspect.
  // The mega Messages shell still owns the LIST (no path segment after
  // "messages") + the legacy ?inquiry=<id> query-param flow. The new
  // /messages/<id> path is read-only inspect with "Open in Messages" CTA
  // back to the shell for composing.
  (s) => s[0] === "admin" && s[1] === "messages" && typeof s[2] === "string" && s[2].length > 0,
];

export function pathIsCanonical(pathname: string | null): boolean {
  if (!pathname) return false;
  const parts = pathname.replace(/^\/+/, "").split("/").filter(Boolean);
  if (parts.length === 0) return false;
  // Platform-scoped talent routes: /talent/trust, /talent/discover, …
  if (parts[0] === "talent") {
    return CANONICAL_ROUTE_MATCHERS.some((match) => match(parts));
  }
  // BRANDED HOST (#912): when the tenant owns the domain, the admin URL carries
  // NO slug — improntamodels.com/admin/activity-log, not /impronta/admin/…. The
  // slice(1) below would eat "admin" and no matcher could ever fire, so every
  // canonical admin page rendered STACKED ON TOP of the prototype SPA on custom
  // domains. Match the segments as-is instead.
  //
  // Safe to key on the literal: "admin" is in WORKSPACE_SLUG_RESERVED_PREFIXES
  // (lib/saas/surface-allow-list.ts), so no tenant slug can ever be "admin" —
  // parts[0] === "admin" therefore always means the branded-host shape.
  if (parts[0] === "admin") {
    return CANONICAL_ROUTE_MATCHERS.some((match) => match(parts));
  }
  // Tenant-scoped: /{slug}/talent/site → ["slug","talent","site"]
  if (parts.length < 2) return false;
  const afterTenant = parts.slice(1);
  return CANONICAL_ROUTE_MATCHERS.some((match) => match(afterTenant));
}
