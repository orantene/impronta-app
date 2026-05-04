/**
 * SaaS P2 — per-host-kind path allow-list.
 *
 * Primary surface-boundary gate. Middleware resolves the host kind via
 * `resolveTenantContext` and then calls `isPathAllowedForHostKind` to
 * decide whether this path may render on this surface at all. Disallowed
 * requests are 404ed before rate limiting, CMS redirects, or auth.
 *
 * Rule table — which groups are reachable on which host:
 *
 *   surface    | root | static | shared api   | auth | storefront | workspaces | storefront api | app api | mkt pages | /t (canonical)
 *   -----------|------|--------|--------------|------|------------|------------|----------------|---------|-----------|---------------
 *   agency     |  ✓   |   ✓    |      ✓       |  ✓   |     ✓      |     ✓      |       ✓        |    ✓    |           |       ✓
 *   app        |  ✓   |   ✓    |      ✓       |  ✓   |            |     ✓      |                |    ✓    |           |       ✓
 *   hub        |  ✓   |   ✓    |      ✓       |  ✓   |            |  slugs ✓   |                |         |           |
 *   marketing  |  ✓   |   ✓    |      ✓       |      |            |            |                |         |    ✓      |
 *
 *   static        → `/sitemap.xml`, `/robots.txt` (handlers generate their
 *                   own host-appropriate output)
 *   shared api    → `/api/cron` (bearer-token gated, host-agnostic),
 *                   `/api/analytics/events` (write-only allow-listed writer)
 *   auth          → `/login`, `/register`, `/forgot-password`,
 *                   `/update-password`, `/auth` (OAuth/magic-link callback)
 *   storefront    → `/directory`, `/t`, `/p`, `/posts`, `/models`, `/contact`
 *   workspaces    → `/admin`, `/client`, `/talent`, `/onboarding`, `/invite`
 *   storefront api→ `/api/directory`, `/api/ai`
 *   app api       → `/api/admin`, `/api/ai`, `/api/location-*`
 *
 *  *Note: `/api/ai` is intentionally reachable on both agency (storefront
 *   discovery/draft) and app (admin inquiry authoring) — that's why it
 *   appears under both "storefront api" and "app api".
 *
 * Auth-surface policy (documented here so it's alongside the gate):
 *   `/login` + `/register` are allowed on **agency** and **hub** hosts as
 *   well as the app host. Rationale: the public header includes a sign-in
 *   link that must land on a working page under the current host, and the hub
 *   now serves workspace-slug paths (Phase 3.15) so unauthenticated workspace
 *   requests must be able to redirect to `/login` without hitting a 404.
 *   Risks: multiple auth entry points increase the blast radius of any auth
 *   bug. Future direction: centralize auth on the app host and have agency /
 *   hub headers deep-link to `app.tulala.digital/login?next=…`. Do not
 *   change without a product decision — see Decision Log for this gate.
 *
 * The root `/` is always allowed and kind-branches its content in
 * `app/page.tsx`. Per-route API handlers keep their own kind-aware gates
 * as defense-in-depth (see `/api/directory`, `/api/ai/search`).
 */

export type HostKind = "agency" | "app" | "hub" | "marketing";

const STATIC_PATHS = ["/sitemap.xml", "/robots.txt"] as const;

/**
 * Self-contained brand/design prototypes under `/prototypes/*`. These are
 * standalone demo surfaces (no tenant reads, no auth, no platform chrome)
 * used to explore brand directions before committing them to the tenant
 * theme system. Allowed on every host kind so they're reachable from any
 * dev hostname without seeding `agency_domains`.
 */
const PROTOTYPE_PREFIX = "/prototypes" as const;

/**
 * API paths reachable on every surface:
 *   - `/api/cron/*`          → scheduler bearer-token protected
 *   - `/api/analytics/events`→ write-only, name allow-listed
 * These never leak tenant data and have their own gates.
 */
const SHARED_API_PREFIXES = [
  "/api/cron",
  "/api/analytics/events",
] as const;

const AUTH_PREFIXES = [
  "/login",
  "/register",
  "/forgot-password",
  "/update-password",
  "/auth",
] as const;

const AGENCY_STOREFRONT_PREFIXES = [
  "/directory",
  "/t",
  "/p",
  "/posts",
  "/models",
  // `/contact` removed — CMS clean-URL rewrite in middleware.ts maps
  // single-segment paths to /p/{slug} so any CMS page slug gets a clean
  // root URL without maintaining an explicit entry here.
  // Phase 9 — operator-issued share links. Token-gated viewer that
  // renders a frozen homepage revision snapshot to an unauthenticated
  // visitor. Tenant scope is enforced inside the route handler via the
  // signed `tid` claim cross-checked against the resolved host.
  "/share",
] as const;

const AGENCY_API_PREFIXES = [
  "/api/directory",
  "/api/ai",
] as const;

const APP_WORKSPACE_PREFIXES = [
  "/admin",
  "/client",
  "/talent",
  "/onboarding",
  "/invite",
  // QA-1 fix — bare `/account` server-redirects the actor to their
  // role-scoped account page (/admin/account, /client/account, or
  // /talent/account). Reachable wherever the role-scoped pages are
  // reachable (agency + app hosts). Without this entry the surface
  // allow-list 404s the request before Next routing can run the
  // redirect, so the operator hits a blank "Not found" page.
  "/account",
  // Phase 3.11 — Tulala HQ platform super_admin console.
  // Lives at /platform/admin/* on the app host (no tenant slug).
  // Gated inside layout.tsx to app_role === 'super_admin'.
  "/platform",
] as const;

/**
 * Admin / talent dashboards make Google-Places-backed canonical-location
 * picker calls, so the four `/api/location-*` routes are app-host only.
 * They are hyphenated (not a URL segment), so they're matched exactly.
 */
const APP_API_PREFIXES = [
  "/api/admin",
  "/api/ai",
] as const;

const APP_API_EXACT_PATHS = [
  "/api/location-place-details",
  "/api/location-country-details",
  "/api/location-countries",
  "/api/location-cities",
] as const;

/**
 * Canonical public talent surface (`/t/[profileCode]`). Lives on the app host
 * as the global canonical view (Phase 5/6 M2) and on agency hosts as the
 * agency-overlay view. Hub and marketing hosts 404 it — talent pages on the
 * hub belong to the approved-hub-directory surface, not `/t`.
 */
const CANONICAL_TALENT_PREFIX = "/t" as const;

/**
 * Phase 3 — multi-tenant workspace surface on the app host.
 * Pattern: `/<tenantSlug>/<surface>` where surface ∈ {admin, talent, client, platform}.
 *
 * The first path segment is the tenant's URL slug (e.g. "impronta") and the
 * second is the workspace surface. Exact tenant-slug validation happens inside
 * the route handler via `getTenantScopeBySlug()`. The allow-list only needs to
 * confirm the shape matches the canonical workspace URL pattern.
 *
 * Reserved first segments (existing top-level routes) are excluded explicitly
 * so this check can't shadow `/api/admin`, `/t/slug`, auth paths, etc.
 */
const WORKSPACE_SLUG_SURFACES = ["admin", "talent", "client", "platform"] as const;
const WORKSPACE_SLUG_RESERVED_PREFIXES = new Set([
  // Existing APP_WORKSPACE_PREFIXES
  "admin", "client", "talent", "onboarding", "invite", "account",
  // API + auth
  "api", "auth", "login", "register", "forgot-password", "update-password",
  // Public talent canonical
  "t",
  // Static
  "sitemap.xml", "robots.txt",
  // Prototypes + internals
  "prototypes", "_next", "share",
  // Phase 3.11 — HQ super_admin console at /platform/admin/*.
  // "platform" must be reserved so isWorkspaceSlugPath() never treats it
  // as a tenant slug — Next.js static segment `platform/` already takes
  // priority over the dynamic `[tenantSlug]` segment, but reserving it
  // here keeps the allow-list table consistent with the routing truth.
  "platform",
]);

function isWorkspaceSlugPath(pathname: string): boolean {
  // pathname must be "/<tenantSlug>/<surface>" or "/<tenantSlug>/<surface>/..."
  const parts = pathname.split("/");
  // parts: ["", tenantSlug, surface, ...rest]
  const tenantSlug = parts[1];
  const surface = parts[2];
  if (!tenantSlug || !surface) return false;
  // Reject reserved first segments.
  if (WORKSPACE_SLUG_RESERVED_PREFIXES.has(tenantSlug)) return false;
  // Basic slug shape: lowercase alphanum + hyphen, 2–63 chars.
  if (!/^[a-z0-9][a-z0-9-]{1,62}$/.test(tenantSlug)) return false;
  return (WORKSPACE_SLUG_SURFACES as readonly string[]).includes(surface);
}

/**
 * Marketing-only public pages. These render the public SaaS marketing site
 * (sold product, not tenant storefront). They never read tenant data and
 * never require auth. Keep this list scoped; everything else 404s on the
 * marketing host to preserve the surface boundary.
 */
const MARKETING_PAGE_PREFIXES = [
  "/get-started",
  "/operators",
  "/agencies",
  "/organizations",
  "/how-it-works",
  "/network",
  "/integrations",
  "/pricing",
  "/faq",
  "/waitlist",
  "/legal",
] as const;

function hasPrefix(pathname: string, prefix: string): boolean {
  if (pathname === prefix) return true;
  return pathname.startsWith(`${prefix}/`);
}

function anyPrefix(pathname: string, prefixes: readonly string[]): boolean {
  for (const p of prefixes) {
    if (hasPrefix(pathname, p)) return true;
  }
  return false;
}

function anyExact(pathname: string, exact: readonly string[]): boolean {
  for (const e of exact) {
    if (pathname === e) return true;
  }
  return false;
}

/**
 * True when `pathname` is permitted on `kind`. `pathname` must be locale-
 * stripped (e.g. `/directory`, not `/es/directory`) — middleware strips
 * any non-default locale prefix before calling.
 */
export function isPathAllowedForHostKind(
  kind: HostKind,
  pathname: string,
): boolean {
  if (pathname === "/") return true;
  if (anyExact(pathname, STATIC_PATHS)) return true;
  if (hasPrefix(pathname, PROTOTYPE_PREFIX)) return true;
  if (anyPrefix(pathname, SHARED_API_PREFIXES)) return true;

  if (kind === "agency") {
    // Agency owners/staff (and clients/talent of this tenant) can use the
    // workspace from their own subdomain — `impronta.tulala.digital/admin`
    // is equivalent to `app.tulala.digital/admin` for that tenant. The
    // middleware sets TENANT_HEADER to this host's tenant_id, so downstream
    // RLS + auth-flow scope the workspace to this tenant only. A logged-in
    // user who is NOT a member of this tenant gets redirected by the
    // dashboard layout to their canonical workspace on app.tulala.digital.
    return (
      anyPrefix(pathname, AGENCY_STOREFRONT_PREFIXES) ||
      anyPrefix(pathname, AGENCY_API_PREFIXES) ||
      anyPrefix(pathname, APP_WORKSPACE_PREFIXES) ||
      anyPrefix(pathname, APP_API_PREFIXES) ||
      anyExact(pathname, APP_API_EXACT_PATHS) ||
      anyPrefix(pathname, AUTH_PREFIXES) ||
      // Phase 3: /<tenantSlug>/{admin,talent,client,platform}[/*]
      // Agency subdomain hosts can also use the slug-based workspace URL.
      // e.g. impronta.tulala.digital/impronta/admin resolves to the same
      // workspace admin as app.tulala.digital/impronta/admin.
      isWorkspaceSlugPath(pathname)
    );
  }

  if (kind === "app") {
    return (
      anyPrefix(pathname, APP_WORKSPACE_PREFIXES) ||
      anyPrefix(pathname, APP_API_PREFIXES) ||
      anyExact(pathname, APP_API_EXACT_PATHS) ||
      anyPrefix(pathname, AUTH_PREFIXES) ||
      hasPrefix(pathname, CANONICAL_TALENT_PREFIX) ||
      // Phase 3: /<tenantSlug>/{admin,talent,client,platform}[/*]
      isWorkspaceSlugPath(pathname)
    );
  }

  if (kind === "marketing") {
    return anyPrefix(pathname, MARKETING_PAGE_PREFIXES);
  }

  // Phase 3.15 — hub: root + static + shared-api (above) + auth + workspace
  // slug paths. The hub surface (tulala.digital) is the cross-tenant public
  // directory and also serves as an entry point to any tenant workspace via
  // the canonical path pattern /<tenantSlug>/{admin,talent,client}. Auth
  // paths are required so that unauthenticated workspace-slug requests can
  // redirect to /login without 404ing.
  if (kind === "hub") {
    return (
      anyPrefix(pathname, AUTH_PREFIXES) ||
      isWorkspaceSlugPath(pathname)
    );
  }

  return false;
}
