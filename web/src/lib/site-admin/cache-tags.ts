/**
 * Phase 5 — tenant-scoped cache tag helper.
 *
 * The only source of truth for tenant-scoped cache tags in Phase 5. Any call
 * to Next.js `revalidateTag(...)` with a tenant-scoped tag MUST import its
 * key from this module. Bare string tags are banned (ESLint rule enforces;
 * see web/eslint.config.mjs).
 *
 * Tag scheme:
 *   tenant:{tenantId}:{surface}[:{qualifier}]
 *
 * Surfaces (closed set; new surfaces require a PR to this file):
 *   - identity      — agency_business_identity (one tag per tenant)
 *   - branding      — agency_branding (one tag per tenant)
 *   - navigation    — cms_navigation_items
 *   - pages         — per-page: "pages:{pageId}"
 *   - pages-all     — list/route for all pages on a tenant
 *   - sections      — per-section: "sections:{sectionId}"
 *   - sections-all  — list/composer surface for all sections on a tenant
 *   - homepage      — per-locale: "homepage:{locale}"
 *   - storefront    — global tenant storefront bust
 *
 * Locale tags nest after the identifier so `/en` vs `/es` revalidate
 * independently.
 */

export const SITE_ADMIN_SURFACE = [
  "identity",
  "branding",
  "navigation",
  "pages",
  "pages-all",
  "sections",
  "sections-all",
  "homepage",
  "storefront",
] as const;

export type SiteAdminSurface = (typeof SITE_ADMIN_SURFACE)[number];

function assertTenantId(tenantId: string): void {
  if (!tenantId || typeof tenantId !== "string") {
    throw new Error("cache-tags/tagFor: tenantId required");
  }
}

function baseTag(tenantId: string, surface: SiteAdminSurface): string {
  assertTenantId(tenantId);
  return `tenant:${tenantId}:${surface}`;
}

/**
 * Returns a tenant-scoped cache tag. Use the returned string with
 * `revalidateTag()` (server action / API route) and `fetch({ next: { tags: [...] }})`
 * reads.
 *
 * @example
 *   revalidateTag(tagFor(tenantId, "branding"));
 *   revalidateTag(tagFor(tenantId, "pages", { id: pageId }));
 *   revalidateTag(tagFor(tenantId, "homepage", { locale: "en" }));
 */
export function tagFor(
  tenantId: string,
  surface: SiteAdminSurface,
  qualifier?: { id?: string; locale?: string },
): string {
  const base = baseTag(tenantId, surface);
  if (!qualifier) return base;
  if (qualifier.id) return `${base}:${qualifier.id}`;
  if (qualifier.locale) return `${base}:${qualifier.locale}`;
  return base;
}

/**
 * All tags associated with a full tenant storefront bust. Used by
 * bustTenant() in host-context cache layer.
 */
export function tenantBustTags(tenantId: string): readonly string[] {
  assertTenantId(tenantId);
  return SITE_ADMIN_SURFACE.map((s) => baseTag(tenantId, s));
}
