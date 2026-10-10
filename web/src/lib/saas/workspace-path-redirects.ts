import { NextResponse, type NextRequest } from "next/server";

import { getAppUrl } from "@/lib/auth-flow";
import { resolveTenantContextFromPathSlug, type HostContext } from "@/lib/saas/host-context";
import { createServiceRoleClient } from "@/lib/supabase/admin";
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
  /** `/es` when the request carried a non-default locale prefix; goes before `/w`. */
  localePrefix?: string;
}): string | null {
  const slug = input.tenantSlug.trim().toLowerCase();
  const host = input.hostname.trim().toLowerCase();
  if (!slug || host !== `${slug}.tulala.digital`) return null;
  if (brandedSubdomainEligible(normalizeWorkspaceUrlPlan(input.planTier))) return null;
  const path = input.pathname && input.pathname !== "/" ? input.pathname : "";
  const target = new URL(workspacePathUrl(slug));
  target.pathname = `${input.localePrefix ?? ""}${target.pathname}${path}`;
  target.search = input.search ?? "";
  return target.toString();
}

/**
 * Workspace, auth, API and checkout paths stay on the host they were opened on:
 * only the public storefront has a `/w/<slug>` twin to send a visitor to.
 */
const NON_STOREFRONT_PREFIXES = [
  "/api", "/admin", "/login", "/logout", "/auth", "/register",
  "/account", "/client", "/talent", "/onboarding", "/pay", "/c", "/manage", "/share",
];

export function freeSubdomainRedirectablePath(canonicalPath: string): boolean {
  if (canonicalPath.startsWith("/_") || canonicalPath.includes(".")) return false;
  return !NON_STOREFRONT_PREFIXES.some((p) => canonicalPath === p || canonicalPath.startsWith(`${p}/`));
}

export type WorkspacePlanReader = (tenantId: string) => Promise<string | null>;

const PLAN_TTL_MS = 60_000;
const PLAN_MAX_ENTRIES = 500;
const planCache = new Map<string, { plan: string | null; expiresAt: number }>();

/** Test hook. */
export function clearWorkspacePlanCache(): void {
  planCache.clear();
}

async function readPlanWithServiceRole(tenantId: string): Promise<string | null> {
  const admin = createServiceRoleClient();
  if (!admin) throw new Error("no service client");
  const { data, error } = await admin.from("agencies").select("plan_tier").eq("id", tenantId).limit(1).maybeSingle();
  if (error) throw error;
  return ((data ?? null) as { plan_tier?: string | null } | null)?.plan_tier ?? null;
}

/** Raw `agencies.plan_tier`, cached 60s per tenant like the suspended gate. null on any failure. */
async function cachedPlanTier(tenantId: string, read: WorkspacePlanReader, now: number): Promise<string | null> {
  const hit = planCache.get(tenantId);
  if (hit && hit.expiresAt > now) return hit.plan;
  try {
    const plan = await read(tenantId);
    planCache.delete(tenantId);
    planCache.set(tenantId, { plan, expiresAt: now + PLAN_TTL_MS });
    while (planCache.size > PLAN_MAX_ENTRIES) {
      const oldest = planCache.keys().next().value;
      if (oldest === undefined) break;
      planCache.delete(oldest);
    }
    return plan;
  } catch {
    return null;
  }
}

/**
 * onb1-17 proxy wire: a Free workspace opened on its leftover
 * `<slug>.tulala.digital` host gets a 308 to `tulala.digital/w/<slug>/...`.
 *
 * Fails OPEN: only a plan read that says exactly `free` redirects. An unknown
 * plan or a read error serves the subdomain as before, because
 * `normalizeWorkspaceUrlPlan` maps unknown to "free" and a paying workspace must
 * never be bounced off its branded host by a DB blip.
 */
export async function freeSubdomainPathRedirect(params: {
  request: NextRequest;
  pathname: string;
  canonicalPath: string;
  hostContext: HostContext;
  readPlan?: WorkspacePlanReader;
  now?: number;
}): Promise<NextResponse | null> {
  const { request, pathname, canonicalPath, hostContext } = params;
  if (hostContext.kind !== "agency" || hostContext.domainKind !== "subdomain") return null;
  if (request.method !== "GET" && request.method !== "HEAD") return null;
  if (!freeSubdomainRedirectablePath(canonicalPath)) return null;
  if (hostContext.hostname.trim().toLowerCase() !== `${hostContext.tenantSlug.trim().toLowerCase()}.tulala.digital`) return null;
  const plan = await cachedPlanTier(hostContext.tenantId, params.readPlan ?? readPlanWithServiceRole, params.now ?? Date.now());
  if ((plan ?? "").trim().toLowerCase() !== "free") return null;
  const target = freeSubdomainToPathRedirectUrl({
    hostname: hostContext.hostname,
    tenantSlug: hostContext.tenantSlug,
    planTier: plan,
    pathname: canonicalPath,
    search: request.nextUrl.search,
    localePrefix: pathname.slice(0, pathname.length - canonicalPath.length),
  });
  return target ? NextResponse.redirect(target, 308) : null;
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
