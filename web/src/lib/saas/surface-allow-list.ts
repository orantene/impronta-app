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
 *   storefront    → `/directory`, `/t`, `/p`, `/posts`, `/models`
 *   path-slug     → `/<tenantSlug>` and `/<tenantSlug>/{t,directory,p,posts,models,...}`.
 *                   Middleware resolves the first segment to a tenant and
 *                   strips it before calling this allow-list as an agency path.
 *   workspaces    → `/admin`, `/client`, `/talent`, `/onboarding`, `/invite`
 *   storefront api→ `/api/directory`, `/api/ai`
 *   app api       → `/api/admin`, `/api/ai`, `/api/location-*`
 *
 *  *Note: `/api/ai` is intentionally reachable on both agency (storefront
 *   discovery/draft) and app (admin inquiry authoring) — that's why it
 *   appears under both "storefront api" and "app api". The marketing apex
 *   does **not** get the whole `/api/ai` tree (`/api/ai/search` must stay
 *   404 there). Only `/api/ai/guest-support-chat` is opened, because the
 *   Ask Tulala launcher lives on tulala.digital and POSTs that path after
 *   the guest ticket is created. Without this entry the proxy never reaches
 *   the handler; the browser gets marketing HTML and the chat stays silent.
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

// Decomposed 2026-09-03. This file is the barrel and stays the import path
// for all 20 consumers; every symbol below is re-exported unchanged.

export type { HostKind } from "./host-kinds";
export { isSurfaceHostKind } from "./host-kinds";
export { isTenantSlugCandidate, isWorkspaceSlugPath } from "./reserved-slugs";
export type { PathBasedTenantPublicPath } from "./tenant-paths";
export { WORKSPACE_PATH_SEGMENT, resolveAnyTenantPublicPath, resolvePathBasedTenantPublicPath, resolveWorkspacePathTenantPublicPath } from "./tenant-paths";
export { isPathAllowedForHostKind } from "./gate";
