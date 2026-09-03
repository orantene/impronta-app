/**
 * Words a tenant may not claim, and the two shapes that read them.
 *
 * A reserved segment is not a style rule. Once a root segment resolves on a
 * tenant host, a CMS page authored at that slug can never open, so the word
 * has to be unavailable BEFORE anyone can author it.
 *
 * Extracted from `surface-allow-list.ts`; that file is now the barrel and
 * remains the import path for every consumer.
 */

/**
 * Phase 3 — multi-tenant workspace surface on the app host. Pattern:
 * `/<tenantSlug>/<surface>` where surface ∈ {admin, talent, client, platform}.
 * The first path segment is the tenant's URL slug (e.g. "impronta") and the
 * second is the workspace surface. Exact tenant-slug validation happens inside
 * the route handler via `getTenantScopeBySlug()`. The allow-list only needs to
 * confirm the shape matches the canonical workspace URL pattern. Reserved
 * first segments (existing top-level routes) are excluded explicitly so this
 * check can't shadow `/api/admin`, `/t/slug`, auth paths, etc.
 */
const WORKSPACE_SLUG_SURFACES = ["admin", "talent", "client", "platform", "admin-preview"] as const;

export const WORKSPACE_SLUG_RESERVED_PREFIXES = new Set([
  // Existing APP_WORKSPACE_PREFIXES
  "admin", "admin-preview", "client", "talent", "onboarding", "invite", "account",
  // API + auth
  "api", "auth", "login", "register", "forgot-password", "update-password",
  // Public talent canonical
  "t",
  // Guest full-window conversation (/c/[inquiryId]) — U1 mini→full expansion.
  "c",
  // QR & Links (/q/[code]); reserved so no tenant slug shadows every printed code.
  "q",
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
  // Canonical public parent segment for path-based workspaces
  // (tulala.digital/w/<slug>). Reserved so no tenant can claim the slug "w"
  // and shadow the parent, and so the legacy flat resolver never reads
  // "/w/<slug>" as tenant "w".
  "w",
  "contact",
  "directory",
  "book",
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

export function isWorkspaceSlugPath(pathname: string): boolean {
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

export function isTenantSlugCandidate(segment: string | undefined): segment is string {
  if (!segment) return false;
  if (PATH_BASED_TENANT_RESERVED_PREFIXES.has(segment)) return false;
  return /^[a-z0-9][a-z0-9-]{1,62}$/.test(segment);
}
