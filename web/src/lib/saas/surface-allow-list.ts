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
 *   agency     |  ✓   |   ✓    |      ✓       |  ✓   |     ✓      |            |       ✓        |    ✓*   |           |       ✓
 *   app        |  ✓   |   ✓    |      ✓       |  ✓   |            |     ✓      |                |    ✓    |           |       ✓
 *   hub        |  ✓   |   ✓    |      ✓       |      |            |            |                |         |           |
 *   marketing  |  ✓   |   ✓    |      ✓       |      |            |            |                |         |    ✓      |
 *
 *   static        → `/sitemap.xml`, `/robots.txt` (handlers generate their
 *                   own host-appropriate output)
 *   shared api    → `/api/cron` (bearer-token gated, host-agnostic),
 *                   `/api/analytics/events` (write-only allow-listed writer)
 *   auth          → `/login`, `/register`, `/forgot-password`,
 *                   `/update-password`, `/auth` (OAuth/magic-link callback)
 *   storefront    → `/directory`, `/t`, `/p`, `/posts`, `/models`, `/contact`
 *   workspaces    → `/admin`, `/client`, `/talent`, `/onboarding`
 *   storefront api→ `/api/directory`, `/api/ai`
 *   app api       → `/api/admin`, `/api/ai`, `/api/location-*`
 *
 *  *Note: `/api/ai` is intentionally reachable on both agency (storefront
 *   discovery/draft) and app (admin inquiry authoring) — that's why it
 *   appears under both "storefront api" and "app api".
 *
 * Auth-surface policy (documented here so it's alongside the gate):
 *   `/login` + `/register` are allowed on **agency** hosts as well as the
 *   app host. Rationale: the public header includes a sign-in link that
 *   must land on a working page under the current agency brand. Risks:
 *   two auth entry points increase the blast radius of any auth bug and
 *   split the cookie scope conversation across hostnames. Future direction:
 *   centralize the auth surface on the app host and have the agency header
 *   deep-link to `app.impronta.group/login?next=…`. Do not change without
 *   a product decision — see Decision Log for this gate.
 *
 * The root `/` is always allowed and kind-branches its content in
 * `app/page.tsx`. Per-route API handlers keep their own kind-aware gates
 * as defense-in-depth (see `/api/directory`, `/api/ai/search`).
 */

export type HostKind = "agency" | "app" | "hub" | "marketing";

const STATIC_PATHS = ["/sitemap.xml", "/robots.txt"] as const;

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
  "/contact",
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
  if (anyPrefix(pathname, SHARED_API_PREFIXES)) return true;

  if (kind === "agency") {
    return (
      anyPrefix(pathname, AGENCY_STOREFRONT_PREFIXES) ||
      anyPrefix(pathname, AGENCY_API_PREFIXES) ||
      anyPrefix(pathname, AUTH_PREFIXES)
    );
  }

  if (kind === "app") {
    return (
      anyPrefix(pathname, APP_WORKSPACE_PREFIXES) ||
      anyPrefix(pathname, APP_API_PREFIXES) ||
      anyExact(pathname, APP_API_EXACT_PATHS) ||
      anyPrefix(pathname, AUTH_PREFIXES) ||
      hasPrefix(pathname, CANONICAL_TALENT_PREFIX)
    );
  }

  if (kind === "marketing") {
    return anyPrefix(pathname, MARKETING_PAGE_PREFIXES);
  }

  // hub: root, static, shared-api only.
  return false;
}
