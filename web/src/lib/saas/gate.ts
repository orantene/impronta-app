/**
 * The gate itself: may this path render on this host kind?
 *
 * Extracted from `surface-allow-list.ts`; that file is now the barrel and
 * remains the import path for every consumer.
 */

import type { HostKind } from "./host-kinds";
import { AGENCY_API_PREFIXES, AGENCY_STOREFRONT_PREFIXES, APP_API_EXACT_PATHS, APP_API_PREFIXES, APP_WORKSPACE_PREFIXES, AUTH_PREFIXES, CANONICAL_GUEST_THREAD_PREFIX, CANONICAL_LINK_PREFIX, CANONICAL_TALENT_PREFIX, CHECKOUT_PREFIX, COMPLIANCE_PREFIXES, EMBED_EXACT_PATHS, EMBED_PREFIX, MARKETING_API_PREFIXES, MARKETING_PAGE_PREFIXES, PROTOTYPE_PREFIX, PWA_PATHS, SHARED_API_PREFIXES, STATIC_PATHS, WELL_KNOWN_PREFIX } from "./path-groups";
import { anyExact, anyPrefix, hasPrefix } from "./path-utils";
import { isWorkspaceSlugPath } from "./reserved-slugs";

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
  if (hasPrefix(pathname, WELL_KNOWN_PREFIX)) return true;
  if (hasPrefix(pathname, PROTOTYPE_PREFIX)) return true;
  if (anyPrefix(pathname, SHARED_API_PREFIXES)) return true;
  if (anyPrefix(pathname, COMPLIANCE_PREFIXES)) return true;
  // Post-checkout landing + public embed widget — host-agnostic (see consts).
  if (hasPrefix(pathname, CHECKOUT_PREFIX)) return true;
  if (hasPrefix(pathname, EMBED_PREFIX)) return true;
  if (anyExact(pathname, EMBED_EXACT_PATHS)) return true;

  // A tracked link resolves only where a tenant owns the code.
  if (hasPrefix(pathname, CANONICAL_LINK_PREFIX)) return kind === "agency" || kind === "hub";

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
      anyPrefix(pathname, MARKETING_API_PREFIXES) ||
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
