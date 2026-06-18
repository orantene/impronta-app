import "server-only";

import { createServiceRoleClient } from "@/lib/supabase/admin";

/**
 * ANALYTICS-1 — server-side tenant derivation for the unauthenticated
 * `/api/analytics/events` route.
 *
 * The events route is intentionally unauthenticated (browsers POST page-view
 * + product events with no session) and was trusting a client-supplied
 * `tenant_id`. That field is spoofable: a caller could attribute their events
 * to ANY tenant, poisoning another tenant's WebsitePerformance panel.
 *
 * This module resolves the tenant the SERVER can prove from the request:
 *   1. the request `Host` header → `agency_domains` lookup (same source of
 *      truth `proxy.ts` / `lib/saas/host-context.ts` use), and
 *   2. (future) the session/JWT if one is present.
 * The client-supplied `tenant_id` is then demoted to a HINT — honoured only
 * when it MATCHES the derived value, dropped otherwise. The derived value
 * always wins. When the host resolves to no tenant (marketing/app/hub hosts,
 * unregistered hosts), the derived value is null and the hint is dropped (we
 * never trust an unprovable client claim).
 *
 * NOTE: the proxy short-circuits `/api/analytics/events` BEFORE host
 * resolution and strips the internal `x-impronta-host-context` /
 * `x-impronta-tenant-*` headers, so this route cannot read a pre-resolved
 * tenant from headers — it must do its own `agency_domains` read here.
 */

const PG_UUID_RE =
  /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

/** Domain kinds that bind to a concrete tenant. marketing/app are tenant-less. */
const TENANT_BOUND_KINDS = new Set(["subdomain", "custom", "hub"]);
const READY_STATUSES = ["active", "ssl_provisioned", "verified"];

/** Normalize a raw `Host` header to a bare lowercase hostname (no port). */
export function normalizeHostHeader(host: string | null | undefined): string | null {
  const raw = host?.trim().toLowerCase();
  if (!raw) return null;
  if (raw.startsWith("[")) {
    // IPv6 literal, e.g. "[::1]:3000" → "::1"
    const end = raw.indexOf("]");
    return end === -1 ? raw : raw.slice(1, end);
  }
  const bare = raw.split(":")[0] ?? raw;
  return bare.length > 0 ? bare : null;
}

/**
 * Pure precedence resolver — the testable core. Given the tenant the server
 * DERIVED from the request (host/session) and the client-supplied HINT,
 * decide the tenant to persist on the event.
 *
 *   - derived present              → derived wins; hint kept only as a match.
 *   - derived absent, hint present → DROP the hint (unprovable → null).
 *
 * Returns the chosen tenant id plus whether a non-matching hint was dropped
 * (for telemetry / tests).
 */
export function resolveEffectiveTenantId(input: {
  derivedTenantId: string | null;
  clientHint: string | null;
}): { tenantId: string | null; hintDropped: boolean } {
  const derived = input.derivedTenantId?.trim() || null;
  const hint = input.clientHint?.trim() || null;

  if (derived) {
    // Derived value is authoritative. The hint is honoured only when it
    // matches; a mismatching (spoofed) hint is dropped but does not change
    // the persisted tenant.
    const hintDropped = hint != null && hint !== derived;
    return { tenantId: derived, hintDropped };
  }

  // Nothing the server can prove. Never trust the client claim alone.
  return { tenantId: null, hintDropped: hint != null };
}

/**
 * Resolve the tenant UUID a request's `Host` header maps to, via an
 * `agency_domains` lookup (service-role, status-gated). Returns null for
 * tenant-less hosts (marketing/app), unregistered hosts, or any error —
 * degrade-safe so the event still writes (just with a null tenant).
 */
export async function deriveTenantIdFromHost(
  hostHeader: string | null | undefined,
): Promise<string | null> {
  const hostname = normalizeHostHeader(hostHeader);
  if (!hostname) return null;

  const supabase = createServiceRoleClient();
  if (!supabase) return null;

  try {
    const { data, error } = await supabase
      .from("agency_domains")
      .select("kind, tenant_id, status")
      .eq("hostname", hostname)
      .in("status", READY_STATUSES)
      .limit(1)
      .maybeSingle();

    if (error || !data) return null;
    const kind = (data.kind as string | null) ?? "";
    const tenantId = (data.tenant_id as string | null) ?? null;
    if (!TENANT_BOUND_KINDS.has(kind)) return null;
    if (!tenantId || !PG_UUID_RE.test(tenantId)) return null;
    return tenantId;
  } catch {
    return null;
  }
}

/**
 * End-to-end tenant derivation for the events route. Derives from the host
 * (the only signal available on this short-circuited, unauthenticated path
 * today) and applies the hint-precedence rule. Exposed as one call so the
 * route stays thin.
 */
export async function deriveTenantIdFromRequest(input: {
  hostHeader: string | null | undefined;
  clientHint: string | null | undefined;
}): Promise<{ tenantId: string | null; hintDropped: boolean }> {
  const derivedTenantId = await deriveTenantIdFromHost(input.hostHeader);
  return resolveEffectiveTenantId({
    derivedTenantId,
    clientHint: input.clientHint ?? null,
  });
}
