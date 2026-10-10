import { NextResponse, type NextRequest } from "next/server";

import { getAppUrl } from "@/lib/auth-flow";
import { resolveTenantContextFromPathSlug } from "@/lib/saas/host-context";
import {
  isWorkspaceSlugPath,
  resolvePathBasedTenantPublicPath,
  resolveWorkspacePathTenantPublicPath,
  WORKSPACE_PATH_SEGMENT,
} from "@/lib/saas/surface-allow-list";
import { brandedSubdomainEligible, workspacePathUrl } from "@/lib/saas/workspace-public-url";
import { normalizeWorkspaceUrlPlan } from "@/lib/saas/workspace-live-url";

/**
 * onb1-17 · Free workspaces advertise `tulala.digital/w/<slug>`. When a leftover
 * branded subdomain host is hit, callers redirect here (308) so there is one
 * public URL. Paid plans keep their subdomain. Pure — proxy supplies planTier.
 */
export function freeSubdomainToPathRedirectUrl(input: {
  hostname: string;
  tenantSlug: string;
  planTier: string | null | undefined;
  pathname?: string;
  search?: string;
}): string | null {
  const slug = input.tenantSlug.trim().toLowerCase();
  const host = input.hostname.trim().toLowerCase();
  if (!slug || host !== `${slug}.tulala.digital`) return null;
  if (brandedSubdomainEligible(normalizeWorkspaceUrlPlan(input.planTier))) return null;
  const path = input.pathname && input.pathname !== "/" ? input.pathname : "";
  const search = input.search ?? "";
  return `${workspacePathUrl(slug)}${path}${search}`;
}

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

/**
 * Bookmarked `tulala.digital/{slug}/admin/*` (and other workspace surfaces)
 * hard-404 because marketing hosts do not route workspace paths. Emitters
 * already produce app-origin URLs; this is the receiving-side 302 for
 * links already in the wild. Unknown slugs still 404 as marketing paths.
 */
export function shouldRedirectMarketingWorkspacePath(args: {
  hostKind: string;
  canonicalPath: string;
}): boolean {
  return args.hostKind === "marketing" && isWorkspaceSlugPath(args.canonicalPath);
}

export async function marketingWorkspacePathRedirect(params: {
  request: NextRequest;
  pathname: string;
  canonicalPath: string;
  hostHeader: string;
  hostKind: string;
}): Promise<NextResponse | null> {
  if (
    !shouldRedirectMarketingWorkspacePath({
      hostKind: params.hostKind,
      canonicalPath: params.canonicalPath,
    })
  ) {
    return null;
  }

  const tenantSlug = params.canonicalPath.split("/")[1];
  if (!tenantSlug) return null;

  const tenantContext = await resolveTenantContextFromPathSlug(
    params.request,
    params.hostHeader,
    tenantSlug,
  );
  if (!tenantContext) return null;

  const dest = new URL(
    `${params.pathname}${params.request.nextUrl.search}`,
    `${getAppUrl()}/`,
  );
  return NextResponse.redirect(dest, 302);
}
