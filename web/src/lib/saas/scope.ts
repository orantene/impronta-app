import { cache } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { cookies, headers } from "next/headers";
import { getCachedActorSession } from "@/lib/server/request-cache";
import { logServerError } from "@/lib/server/safe-error";
import { improntaLog } from "@/lib/server/structured-log";
import { getCurrentUserTenants, type TenantMembership } from "@/lib/saas/tenant";

/**
 * SaaS request scope — the tenant whose data this request is acting on.
 *
 * Resolved from (in order of precedence):
 *   1. An explicit `x-impronta-tenant-id` header set by middleware or tests.
 *   2. The `impronta.active_tenant_id` cookie (admin workspace switcher).
 *   3. The user's first active membership (single-membership users land
 *      here; multi-membership users must pick via the switcher cookie —
 *      `agency_memberships` has no `is_primary` column, so there's no
 *      DB-level default to honour).
 *
 * Fail-hard (Plan L37): if a scope cannot be resolved, returns `null` and
 * callers MUST refuse the request. There is no fallback to tenant #1 at
 * runtime — the legacy seed id is only used in migrations and bootstrap,
 * never here.
 */
export type TenantScope = {
  tenantId: string;
  membership: TenantMembership;
};

const ACTIVE_TENANT_COOKIE = "impronta.active_tenant_id";
const ACTIVE_TENANT_HEADER = "x-impronta-tenant-id";

async function readPreferredTenantId(): Promise<string | null> {
  try {
    const hdr = (await headers()).get(ACTIVE_TENANT_HEADER);
    if (hdr) return hdr;
  } catch {
    // `headers()` can throw in non-request contexts; fall through.
  }
  try {
    const cookieStore = await cookies();
    const match = cookieStore.get(ACTIVE_TENANT_COOKIE);
    if (match?.value) return match.value;
  } catch {
    // cookies() outside a request: ignore.
  }
  return null;
}

function pickDefault(memberships: TenantMembership[]): TenantMembership | null {
  if (memberships.length === 0) return null;
  // No DB-backed "primary" flag on agency_memberships, so selection is:
  //   first active row → else first row at all.
  // Multi-workspace users are expected to pick via the switcher cookie
  // (handled before this helper runs in getTenantScope).
  const firstActive = memberships.find((m) => m.status === "active");
  if (firstActive) return firstActive;
  return memberships[0] ?? null;
}

/**
 * Current tenant scope for this request. Request-scoped cache.
 *
 * Returns `null` if:
 *   - actor is unauthenticated
 *   - actor has no memberships and no explicit tenant preference
 *   - preferred tenant id doesn't match any membership the actor has
 *
 * Callers on admin routes should treat `null` as "no tenant workspace
 * selected" and redirect / 403 rather than default to any tenant.
 */
export const getTenantScope = cache(
  async (): Promise<TenantScope | null> => {
    const session = await getCachedActorSession();
    if (!session.supabase || !session.user) return null;

    const memberships = await getCurrentUserTenants();
    if (memberships.length === 0) return null;

    const preferred = await readPreferredTenantId();
    if (preferred) {
      const match = memberships.find((m) => m.tenant_id === preferred);
      if (match) {
        return { tenantId: match.tenant_id, membership: match };
      }
      // Preferred tenant not in memberships → do NOT silently downgrade.
      // Fail-hard: the app layer must clear the cookie or prompt a switch.
      //
      // Plan M3 exit criterion: "Tampered cookie … is rejected server-side
      // with audit log entry." This is the single choke point on the read
      // side — every admin/action path funnels through here — so we log
      // here exactly once per request (getTenantScope is request-cached).
      // Structured log is grep-friendly and bubbles to our log store; we
      // deliberately do NOT insert into platform_audit_log here because
      // that table's SECURITY DEFINER wrappers all require
      // is_staff_of_tenant() and the whole point is this actor is NOT
      // staff of the attempted tenant.
      void improntaLog("security.tenant_cookie_tamper", {
        actor_id: session.user.id,
        attempted_tenant_id: preferred,
        membership_count: memberships.length,
      });
      return null;
    }

    const chosen = pickDefault(memberships);
    if (!chosen) return null;
    return { tenantId: chosen.tenant_id, membership: chosen };
  },
);

/**
 * Asserts a tenant scope exists and returns it. Throws on missing scope.
 * Use at the top of server actions / route handlers that require tenant
 * context.
 */
export async function requireTenantScope(): Promise<TenantScope> {
  const scope = await getTenantScope();
  if (!scope) {
    throw new Error("no tenant scope resolved for this request");
  }
  return scope;
}

/**
 * Hint helper for query builders that want to .eq('tenant_id', …).
 * Returns only the tenant id string; throws if unresolved.
 */
export async function getScopedTenantId(): Promise<string> {
  const scope = await requireTenantScope();
  return scope.tenantId;
}

/**
 * Phase 4 stub — resolves a tenant from a hostname. Used by storefront
 * routing middleware to attach tenant scope to anonymous public requests.
 *
 * Phase 2 provides the lookup against `agency_domains`; middleware wiring
 * lands in Phase 4. Returned tenant id goes into the
 * `x-impronta-tenant-id` header on the rewritten request so
 * {@link getTenantScope} picks it up downstream.
 */
export async function resolveTenantFromHost(
  supabase: SupabaseClient,
  hostname: string,
): Promise<{ tenantId: string; hostname: string } | null> {
  const normalized = hostname.trim().toLowerCase();
  if (!normalized) return null;

  try {
    const { data, error } = await supabase
      .from("agency_domains")
      .select("tenant_id, hostname, status")
      .eq("hostname", normalized)
      .in("status", ["active", "ssl_provisioned", "verified"])
      .limit(1)
      .maybeSingle();

    if (error) {
      logServerError("saas/scope.resolveTenantFromHost", error);
      return null;
    }
    if (!data) return null;
    return { tenantId: data.tenant_id, hostname: data.hostname };
  } catch (error) {
    logServerError("saas/scope.resolveTenantFromHost", error);
    return null;
  }
}

export const TENANT_COOKIE_NAME = ACTIVE_TENANT_COOKIE;
export const TENANT_HEADER_NAME = ACTIVE_TENANT_HEADER;

const HOST_CONTEXT_HEADER = "x-impronta-host-context";
const HOST_NAME_HEADER = "x-impronta-host-name";

/**
 * Route context resolved by edge middleware for this request.
 *
 *   - "agency"    — tenant-scoped storefront (subdomain or custom domain).
 *                   `tenantId` is always set.
 *   - "hub"       — global hub (cross-tenant public directory).
 *   - "app"       — internal admin / coordination app.
 *   - "marketing" — public SaaS marketing site.
 *   - "unknown"   — header was missing (non-request context, tests, etc.).
 */
export type PublicHostContext =
  | { kind: "agency"; tenantId: string; hostname: string | null }
  // Phase 5/6 M1 — hub carries the hub agency tenantId so render code can
  // call CMS reads (loadPublicHomepage, identity, branding, menus) using
  // the same tenant-scoped path that agency tenants use. The host kind
  // remains "hub" so surface allow-list / dispatch behavior is unchanged.
  | { kind: "hub"; tenantId: string; hostname: string | null }
  | { kind: "app"; tenantId: null; hostname: string | null }
  | { kind: "marketing"; tenantId: null; hostname: string | null }
  | { kind: "unknown"; tenantId: null; hostname: null };

/**
 * Read the host context headers set by middleware. Safe to call from any
 * server code that sees request headers; returns `{ kind: "unknown" }`
 * outside a request (e.g. build-time metadata generation).
 */
export async function getPublicHostContext(): Promise<PublicHostContext> {
  try {
    const h = await headers();
    const context = h.get(HOST_CONTEXT_HEADER);
    const hostname = h.get(HOST_NAME_HEADER);
    const tenantId = h.get(ACTIVE_TENANT_HEADER);

    switch (context) {
      case "agency":
        if (!tenantId) return { kind: "unknown", tenantId: null, hostname: null };
        return { kind: "agency", tenantId, hostname };
      case "hub":
        // Middleware sets the tenant header for hub the same way it does
        // for agency (post-M1). Missing header on a hub context means
        // mid-deploy state — fall back to "unknown" rather than render
        // a hub surface that can't reach its CMS.
        if (!tenantId) return { kind: "unknown", tenantId: null, hostname: null };
        return { kind: "hub", tenantId, hostname };
      case "app":
        return { kind: "app", tenantId: null, hostname };
      case "marketing":
        return { kind: "marketing", tenantId: null, hostname };
      default:
        return { kind: "unknown", tenantId: null, hostname: null };
    }
  } catch {
    return { kind: "unknown", tenantId: null, hostname: null };
  }
}

/**
 * Hostname-based tenant scope for anonymous / public storefront requests.
 *
 * Unlike {@link getTenantScope}, this does NOT require a signed-in user or
 * agency_membership — it only trusts the `x-impronta-tenant-id` header that
 * the subdomain middleware injects from a verified `agency_domains` lookup.
 *
 * Returns:
 *   - `{ tenantId }` when the request hostname mapped to a tenant
 *   - `null` when the request is on the platform root (no tenant scope)
 *
 * Callers filtering data by tenant should treat `null` as "hub / platform
 * root" and either show a federated view (if applicable) or a landing page.
 */
export async function getPublicTenantScope(): Promise<
  { tenantId: string } | null
> {
  try {
    const tenantId = (await headers()).get(ACTIVE_TENANT_HEADER);
    if (!tenantId) return null;
    return { tenantId };
  } catch {
    return null;
  }
}
