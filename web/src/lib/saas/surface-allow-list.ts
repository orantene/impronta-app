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
 *   hub        |  ✓   |   ✓    |      ✓       |  ✓   | path-slug  |  slugs ✓   |                |         |           |
 *   marketing  |  ✓   |   ✓    |      ✓       |  ✓   | path-slug  |            |                |         |    ✓      |       ✓
 *
 *   static        → `/sitemap.xml`, `/robots.txt` (handlers generate their
 *                   own host-appropriate output)
 *   shared api    → `/api/cron` (bearer-token gated, host-agnostic),
 *                   `/api/analytics/events` (write-only allow-listed writer)
 *   auth          → `/login`, `/register`, `/forgot-password`,
 *                   `/join`, `/update-password`, `/auth` (OAuth/magic-link callback)
 *   storefront    → `/directory`, `/t`, `/p`, `/posts`, `/models`, `/contact`
 *   path-slug     → `/<tenantSlug>` and `/<tenantSlug>/{t,directory,p,posts,models,...}`.
 *                   Middleware resolves the first segment to a tenant and
 *                   strips it before calling this allow-list as an agency path.
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

const STATIC_PATHS = [
  "/sitemap.xml",
  "/robots.txt",
  // Root Next.js metadata file-routes (`app/opengraph-image.tsx`,
  // `app/twitter-image.tsx`). They are host-aware (agency card vs. Tulala
  // card) and are referenced by absolute URL in every page's og:image /
  // twitter:image. Without an allow-list entry the marketing host treats the
  // single segment as a storefront slug and 404s, which silently breaks every
  // social-share preview. Allowed on all kinds; the route decides what to render.
  "/opengraph-image",
  "/twitter-image",
] as const;

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
 *   - `/api/stripe/*`        → Stripe webhook signature-protected; must NOT be
 *                              gated by host-resolution because Stripe sends
 *                              events to whatever public endpoint we register
 *                              and the originating Host header may not match
 *                              any seeded `agency_domains` row.
 *   - `/api/health/*`        → read-only deploy diagnostics (e.g.
 *                              `/api/health/guest-chat` reports only the BOOLEAN
 *                              presence of the Upstash KV env vars — no secret
 *                              values, no tenant data). Intentionally
 *                              unauthenticated so `deploy:smoke` can probe the
 *                              deployed runtime without a session; without this
 *                              entry the proxy rewrote it to a 404 and the
 *                              smoke check could never read the anti-spam signal.
 *   - `/api/dev/reset-guest` → QA/E2E fresh-guest-session reset (W0-H). Unlike
 *                              the rest of `/api/dev/*` (bypassed in proxy.ts
 *                              for dev + preview ONLY), this single route is
 *                              also allowed through on production hosts
 *                              because its own gate accepts either dev/preview
 *                              OR an authenticated staff session — production
 *                              staff need it to get a clean guest cookie while
 *                              QA-ing the live guest chat panel. It clears only
 *                              the `impronta_guest` cookie (no DB writes) and
 *                              404s (never 403) when neither gate passes, so
 *                              listing it here does not advertise a capability.
 * These never leak tenant data and have their own gates.
 */
const SHARED_API_PREFIXES = [
  "/api/cron",
  "/api/analytics/events",
  "/api/stripe",
  "/api/health",
  "/api/dev/reset-guest",
] as const;

/**
 * Compliance endpoints reachable on every surface, regardless of host kind:
 *   - `/unsubscribe/<token>`     → branded one-click unsubscribe page
 *   - `/api/unsubscribe/<token>` → RFC 8058 List-Unsubscribe POST target
 * The per-user token in the URL is the only credential; these carry no tenant
 * data and must never 404, since an unsubscribe link in an email can be opened
 * from any host context (platform apex, agency vanity domain, or app host).
 */
const COMPLIANCE_PREFIXES = [
  "/unsubscribe",
  "/api/unsubscribe",
  // STANDING reviews — the emailed review-invite landing at
  // `/review/<invite_token>`. Like unsubscribe, the per-recipient token in the
  // URL is the only credential and the link can be opened from any host context
  // (platform apex, agency vanity domain, or app host), so it must never 404 on
  // a tenant host. Identity is auth-matched server-side inside the action; the
  // token is never trusted for identity.
  "/review",
] as const;

/**
 * PWA fallback route reachable on every surface, regardless of host kind:
 *   - `/offline` → the service-worker offline fallback page (force-static,
 *                  no tenant/auth data). The SW pre-caches it during install
 *                  by fetching it over the network, so it must return 200 on
 *                  every host (app, agency subdomain, custom domain, hub).
 *                  Without this entry the proxy 404s it on tenant hosts and
 *                  the SW can never cache the fallback. Goes through the proxy
 *                  (unlike sw.js/manifest, which are static files exempted at
 *                  the matcher) so the force-dynamic root layout still gets its
 *                  locale + host headers.
 */
const PWA_PATHS = ["/offline"] as const;

/**
 * Post-checkout landing pages reachable on every surface, regardless of host
 * kind. Stripe builds `success_url` / `cancel_url` from the request origin
 * (see `client-pipeline.ts`), so after a client pays, Stripe redirects them to
 * `/checkout/success` (or `/checkout/cancel`) on whatever host they started
 * from (app, agency subdomain, custom domain, hub). These pages read only the
 * returned checkout session and carry no cross-tenant data. Without this entry
 * a paying customer hits a branded 404 the instant they complete payment.
 */
const CHECKOUT_PREFIX = "/checkout" as const;

/**
 * Public embed loader + roster widget reachable on every surface. They are
 * dropped as a `<script>` / `<iframe>` on partner sites (frame-ancestors *), so
 * the originating Host header is an external partner domain that never matches a
 * seeded `agency_domains` row and must pass the surface gate host-agnostically:
 *   - `/embed.js`                → the loader script (exact match; the `.js`
 *                                  suffix is NOT one of the matcher's image-only
 *                                  extension bypasses, so it reaches this gate)
 *   - `/embed`, `/embed/roster/*`→ the iframe roster widget
 * Tenant scope is enforced inside each route handler.
 */
const EMBED_PREFIX = "/embed" as const;
const EMBED_EXACT_PATHS = ["/embed.js"] as const;

const AUTH_PREFIXES = [
  "/login",
  "/register",
  "/join",
  "/forgot-password",
  "/update-password",
  "/auth",
  // Tenant-scoped registration entry points. Without these, hitting
  // `https://<tenant>.tulala.digital/talent/register` or its custom-domain
  // equivalent (e.g. `improntamodels.com/talent/register`) 404'd at the
  // middleware allow-list. The route file at
  // `web/src/app/(auth)/talent/register/page.tsx` exists and works; this
  // adds it to the agency-host allow-list so the talent-acquisition funnel
  // is reachable from the tenant's own canonical host.
  "/talent/register",
  "/client/register",
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
  // Emailed team-invite redemption links (`/team-invite/[id]/route.ts`) resolve
  // an invite token then redirect to join/login. The email builds the link from
  // the app/agency host, so without this entry the link 404s at the surface gate
  // before the route handler can run.
  "/team-invite",
  // Editor template preview (`/template-preview/[key]/page.tsx`) is embedded by
  // every template picker in the site editor — app/agency workspace context.
  "/template-preview",
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
  // Phase 9 — operator-issued share links (CMS revisions + Pitch landings).
  // Allowed on app/hub hosts too so links sent via WhatsApp resolve when the
  // recipient lands on app.tulala.digital or a localhost dev mirror. Tenant
  // scope is enforced inside the route handler via the signed JWT claims.
  "/share",
] as const;

/**
 * Admin / talent dashboards make Google-Places-backed canonical-location
 * picker calls, so the four `/api/location-*` routes are app-host only.
 * They are hyphenated (not a URL segment), so they're matched exactly.
 */
const APP_API_PREFIXES = [
  "/api/admin",
  "/api/ai",
  // Directory API can serve path-based tenant previews on the canonical app
  // host; the route handler resolves and enforces tenant scope itself.
  "/api/directory",
  // Phase B-4 + Phase E (2026-05-14) — client-side dashboard API routes
  // for the new InquiryDrawer + Messages tabs + Offer actions. RLS gates
  // tenant scope inside the route; middleware just lets the path through.
  "/api/client",
  // D2 (2026-05-14) — Discover engine API. Cross-tenant talent browse for
  // any authenticated client (Standard tier baseline). Tenant scope is
  // deliberately bypassed inside the route via service-role since Discover
  // surfaces is_discoverable=true talents platform-wide. See
  // web/docs/discover-and-unified-inquiry-2026-05-14.md §7.
  "/api/discover",
  // Talent self-service dashboard API (e.g. /api/talent/media/library — the
  // Max-tier page-builder media picker, /api/talent/tax-summary). The route
  // handlers enforce talent-self / managing-staff auth themselves; the proxy
  // just lets the app-host path through.
  "/api/talent",
] as const;

const APP_API_EXACT_PATHS = [
  "/api/location-place-details",
  "/api/location-country-details",
  "/api/location-countries",
  "/api/location-cities",
] as const;

/**
 * Canonical public talent surface (`/t/[profileCode]`). Agency hosts render the
 * agency-skinned roster view; app + marketing Tulala hosts render the platform
 * profile (Max snapshot when published). Hub also allows `/t` for tulala.digital.
 */
const CANONICAL_TALENT_PREFIX = "/t" as const;

/**
 * Guest full-window conversation surface (`/c/[inquiryId]`) — U1 mini→full
 * expansion. Reachable wherever a guest may be when they click "Open full
 * conversation" (agency storefronts, hub, app, marketing). Ownership is gated
 * server-side by the x-impronta-guest cookie inside getGuestFullThread — the
 * allow-list just lets the path through.
 */
const CANONICAL_GUEST_THREAD_PREFIX = "/c" as const;

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
const WORKSPACE_SLUG_SURFACES = ["admin", "talent", "client", "platform", "admin-preview"] as const;
const WORKSPACE_SLUG_RESERVED_PREFIXES = new Set([
  // Existing APP_WORKSPACE_PREFIXES
  "admin", "admin-preview", "client", "talent", "onboarding", "invite", "account",
  // API + auth
  "api", "auth", "login", "register", "forgot-password", "update-password",
  // Public talent canonical
  "t",
  // Guest full-window conversation (/c/[inquiryId]) — U1 mini→full expansion.
  "c",
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

const PATH_BASED_TENANT_RESERVED_PREFIXES = new Set([
  ...WORKSPACE_SLUG_RESERVED_PREFIXES,
  "contact",
  "directory",
  "get-started",
  "discover-agencies",
  "operators",
  "agencies",
  "organizations",
  "how-it-works",
  "hub",
  "network",
  "integrations",
  "pricing",
  "faq",
  "waitlist",
  "legal",
  "models",
  "p",
  "posts",
  "share",
]);

const PATH_BASED_STOREFRONT_PREFIXES = [
  "/directory",
  "/t",
  "/p",
  "/posts",
  "/models",
  "/share",
] as const;

const PATH_BASED_REGISTER_PATHS = [
  "/client/register",
  "/talent/register",
  "/join",
] as const;

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

export type PathBasedTenantPublicPath = {
  tenantSlug: string;
  pathnameWithoutTenant: string;
};

export function isTenantSlugCandidate(segment: string | undefined): segment is string {
  if (!segment) return false;
  if (PATH_BASED_TENANT_RESERVED_PREFIXES.has(segment)) return false;
  return /^[a-z0-9][a-z0-9-]{1,62}$/.test(segment);
}

/**
 * Phase 3.15 — path-based public workspace shape.
 *
 * This is deliberately separate from isPathAllowedForHostKind(): it only
 * recognizes `/<tenantSlug>/...` candidates. Middleware resolves the slug to
 * a real tenant, then strips the prefix and re-runs the normal agency
 * allow-list against the unprefixed path.
 */
export function resolvePathBasedTenantPublicPath(
  pathname: string,
): PathBasedTenantPublicPath | null {
  const parts = pathname.split("/").filter(Boolean);
  const tenantSlug = parts[0];
  if (!isTenantSlugCandidate(tenantSlug)) return null;

  if (parts.length === 1) {
    return { tenantSlug, pathnameWithoutTenant: "/" };
  }

  const rest = `/${parts.slice(1).join("/")}`;
  if (
    PATH_BASED_REGISTER_PATHS.includes(rest as typeof PATH_BASED_REGISTER_PATHS[number]) ||
    anyPrefix(rest, PATH_BASED_STOREFRONT_PREFIXES)
  ) {
    return { tenantSlug, pathnameWithoutTenant: rest };
  }

  const firstRestSegment = parts[1];
  if (
    firstRestSegment &&
    !WORKSPACE_SLUG_RESERVED_PREFIXES.has(firstRestSegment) &&
    /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(firstRestSegment)
  ) {
    return { tenantSlug, pathnameWithoutTenant: rest };
  }

  return null;
}

/**
 * Marketing-only public pages. These render the public SaaS marketing site
 * (sold product, not tenant storefront). They never read tenant data and
 * never require auth. Keep this list scoped; everything else 404s on the
 * marketing host to preserve the surface boundary.
 */
const MARKETING_PAGE_PREFIXES = [
  "/get-started",
  "/discover-agencies",
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
  // Self-served operational pages — both public, no auth required.
  // `/status` runs HTTP probes on every page load (see (marketing)/status/page.tsx).
  // `/help` is a four-role docs hub (operators / agencies / talents / clients).
  "/status",
  "/help",
  // Global Talent Directory — public, platform-wide cross-tenant browse of
  // the discoverable set (talent_discover_index matview). Reads no per-tenant
  // private data, requires no auth. `/directory` is already reserved in
  // PATH_BASED_TENANT_RESERVED_PREFIXES so it never resolves as a tenant slug.
  "/directory",
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
  if (anyExact(pathname, PWA_PATHS)) return true;
  if (hasPrefix(pathname, PROTOTYPE_PREFIX)) return true;
  if (anyPrefix(pathname, SHARED_API_PREFIXES)) return true;
  if (anyPrefix(pathname, COMPLIANCE_PREFIXES)) return true;
  // Post-checkout landing + public embed widget — host-agnostic (see consts).
  if (hasPrefix(pathname, CHECKOUT_PREFIX)) return true;
  if (hasPrefix(pathname, EMBED_PREFIX)) return true;
  if (anyExact(pathname, EMBED_EXACT_PATHS)) return true;

  if (kind === "agency") {
    // Agency owners/staff (and clients/talent of this tenant) can use the
    // workspace from their own subdomain — `impronta.tulala.digital/admin`
    // is equivalent to `app.tulala.digital/admin` for that tenant. The
    // middleware sets TENANT_HEADER to this host's tenant_id, so downstream
    // RLS + auth-flow scope the workspace to this tenant only. A logged-in
    // user who is NOT a member of this tenant gets redirected by the
    // dashboard layout to their canonical workspace on app.tulala.digital.
    return (
      hasPrefix(pathname, CANONICAL_GUEST_THREAD_PREFIX) ||
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
      hasPrefix(pathname, CANONICAL_GUEST_THREAD_PREFIX) ||
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
    return (
      hasPrefix(pathname, CANONICAL_GUEST_THREAD_PREFIX) ||
      anyPrefix(pathname, MARKETING_PAGE_PREFIXES) ||
      hasPrefix(pathname, CANONICAL_TALENT_PREFIX) ||
      // OAuth callbacks must be reachable on marketing because `window.location.origin`
      // is used as the redirectTo base and tulala.digital is the apex. Without this,
      // Google sign-in from any marketing-host entry point silently 404s.
      anyPrefix(pathname, AUTH_PREFIXES)
    );
  }

  // Phase 3.15 — hub: root + static + shared-api (above) + auth + workspace
  // slug paths + canonical talent profiles on tulala.digital.
  if (kind === "hub") {
    return (
      hasPrefix(pathname, CANONICAL_GUEST_THREAD_PREFIX) ||
      anyPrefix(pathname, AUTH_PREFIXES) ||
      hasPrefix(pathname, CANONICAL_TALENT_PREFIX) ||
      isWorkspaceSlugPath(pathname)
    );
  }

  return false;
}
