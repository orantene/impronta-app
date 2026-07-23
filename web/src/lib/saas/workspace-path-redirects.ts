import { NextResponse, type NextRequest } from "next/server";

import { resolveTenantContextFromPathSlug } from "@/lib/saas/host-context";
import {
  resolvePathBasedTenantPublicPath,
  resolveWorkspacePathTenantPublicPath,
  WORKSPACE_PATH_SEGMENT,
} from "@/lib/saas/surface-allow-list";

/**
 * `/w` workspace-parent redirects, owned here so proxy.ts stays under its
 * 800-line cap.
 *
 * Path-based (free-tier) workspaces are canonically served at
 * `tulala.digital/w/<slug>`. They used to live flat at the apex root
 * (`/<slug>`), which put every tenant slug in the same namespace as every
 * marketing route — the reason PATH_BASED_TENANT_RESERVED_PREFIXES exists.
 *
 * Two rules:
 *   1. Bare `/w` has no page of its own → 301 to the public discovery surface
 *      rather than 404.
 *   2. Legacy flat `/<slug>/...` → 301 to `/w/<slug>/...`. Those links are in
 *      the wild (bios, DMs, shares) and must keep working. We only redirect
 *      once the slug resolves to a REAL tenant, so an unknown root path keeps
 *      404ing honestly as a marketing path instead of bouncing into /w.
 *
 * `canonicalPath` is locale-stripped; `pathname` is not. The difference is
 * re-applied so `/es/...` redirects stay in Spanish.
 */
export async function workspacePathRedirect(params: {
  request: NextRequest;
  pathname: string;
  canonicalPath: string;
  hostHeader: string;
}): Promise<NextResponse | null> {
  const { request, pathname, canonicalPath, hostHeader } = params;
  const localePrefix = pathname.slice(0, pathname.length - canonicalPath.length);

  const redirectTo = (to: string): NextResponse => {
    const url = request.nextUrl.clone();
    url.pathname = to;
    return NextResponse.redirect(url, 301);
  };

  if (
    canonicalPath === `/${WORKSPACE_PATH_SEGMENT}` ||
    canonicalPath === `/${WORKSPACE_PATH_SEGMENT}/`
  ) {
    return redirectTo(`${localePrefix}/discover-agencies`);
  }

  // Already canonical — nothing to do.
  if (resolveWorkspacePathTenantPublicPath(canonicalPath)) return null;

  const legacyTenant = resolvePathBasedTenantPublicPath(canonicalPath);
  if (!legacyTenant) return null;

  const legacyContext = await resolveTenantContextFromPathSlug(
    request,
    hostHeader,
    legacyTenant.tenantSlug,
  );
  if (!legacyContext) return null;

  return redirectTo(`${localePrefix}/${WORKSPACE_PATH_SEGMENT}${canonicalPath}`);
}
