/**
 * Path-based tenant storefronts: `tulala.digital/w/<slug>/...` and the legacy
 * flat shape. Separate from the gate because middleware resolves the slug
 * FIRST, strips it, and only then asks the gate about the remaining path.
 *
 * Extracted from `surface-allow-list.ts`; that file is now the barrel and
 * remains the import path for every consumer.
 */

import { anyPrefix } from "./path-utils";
import { WORKSPACE_SLUG_RESERVED_PREFIXES, isTenantSlugCandidate } from "./reserved-slugs";

const PATH_BASED_STOREFRONT_PREFIXES = [
  "/directory",
  "/book",
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

export type PathBasedTenantPublicPath = {
  tenantSlug: string;
  pathnameWithoutTenant: string;
};

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
  return resolveTenantPartsToPublicPath(pathname.split("/").filter(Boolean));
}

/**
 * Canonical public parent segment for path-based (free-tier) workspaces:
 * tulala.digital/w/<tenantSlug>/... Workspaces used to live flat at the apex
 * root (`/<tenantSlug>`), which put every tenant slug in the same namespace as
 * every marketing route — the reason PATH_BASED_TENANT_RESERVED_PREFIXES has
 * to exist at all. Moving them under `/w` frees the root namespace
 * permanently: no workspace can shadow a marketing page, and new marketing
 * routes can be added without checking for slug collisions.
 */
export const WORKSPACE_PATH_SEGMENT = "w" as const;

/** Canonical form: `/w/<tenantSlug>/...`. Returns null for anything else. */
export function resolveWorkspacePathTenantPublicPath(
  pathname: string,
): PathBasedTenantPublicPath | null {
  const parts = pathname.split("/").filter(Boolean);
  if (parts[0] !== WORKSPACE_PATH_SEGMENT) return null;
  return resolveTenantPartsToPublicPath(parts.slice(1));
}

/**
 * Accepts BOTH the canonical `/w/<slug>` and the legacy flat `/<slug>` shape.
 * Use this anywhere that reads a tenant out of an inbound URL and must keep
 * working while legacy links are still in the wild (API routes, i18n hrefs).
 * Middleware deliberately does NOT use this: it resolves the canonical form
 * and 301s the legacy one instead.
 */
export function resolveAnyTenantPublicPath(
  pathname: string,
): PathBasedTenantPublicPath | null {
  // Locale-prefixed shape (`/es/w/<slug>/…`): browsers send the LOCALIZED page
  // URL as the Referer, and API routes resolve their path tenant from it — so
  // a Spanish visitor's `/api/directory` calls died with "no tenant" (the flat
  // legacy resolver happily read `es` as a tenant slug). When a locale-looking
  // first segment is followed by the unambiguous `/w/` workspace marker, strip
  // it BEFORE resolving; the flat legacy shape stays untouched.
  const parts = pathname.split("/").filter(Boolean);
  if (
    parts.length > 1 &&
    /^[a-z]{2}(-[a-zA-Z]{2})?$/.test(parts[0] ?? "") &&
    parts[1] === WORKSPACE_PATH_SEGMENT
  ) {
    const stripped = `/${parts.slice(1).join("/")}`;
    const viaLocale = resolveWorkspacePathTenantPublicPath(stripped);
    if (viaLocale) return viaLocale;
  }
  return (
    resolveWorkspacePathTenantPublicPath(pathname) ??
    resolvePathBasedTenantPublicPath(pathname)
  );
}

function resolveTenantPartsToPublicPath(
  parts: string[],
): PathBasedTenantPublicPath | null {
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
