import { createServerClient } from "@supabase/ssr";
import type { NextRequest } from "next/server";
import { parseTenantHostname, type TenantHostnameMatch } from "@/lib/saas/hostname";

/**
 * Edge-safe tenant resolution. Uses the Supabase anon key because
 * `agency_domains` has a public SELECT policy for `status = 'active'` rows
 * (SaaS Phase 1 migration). No session cookie is required — this runs for
 * anonymous storefront traffic.
 *
 * Caches results in-process for the lifetime of the edge worker to avoid
 * hammering the DB on hot storefront paths. The cache is keyed by host only
 * (per-worker), so a slug→tenant mapping that changes live will propagate
 * within the usual edge worker rotation (~minutes).
 */

export type TenantRoutingResult =
  | { kind: "root"; tenantId: null; hostname: string }
  | { kind: "subdomain"; tenantId: string; slug: string; hostname: string }
  | { kind: "custom"; tenantId: string; hostname: string }
  | { kind: "not_found"; hostname: string };

type CacheEntry = { value: TenantRoutingResult; expiresAt: number };
const cache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 60 * 1000;

function cacheKey(host: string): string {
  return host.trim().toLowerCase();
}

function fromCache(host: string): TenantRoutingResult | null {
  const entry = cache.get(cacheKey(host));
  if (!entry) return null;
  if (entry.expiresAt < Date.now()) {
    cache.delete(cacheKey(host));
    return null;
  }
  return entry.value;
}

function intoCache(host: string, value: TenantRoutingResult): TenantRoutingResult {
  cache.set(cacheKey(host), { value, expiresAt: Date.now() + CACHE_TTL_MS });
  return value;
}

function buildEdgeSupabase(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) return null;
  return createServerClient(url, anon, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll() {
        // No-op — hostname resolution never sets cookies.
      },
    },
  });
}

export async function resolveTenantRouting(
  request: NextRequest,
  hostname: string,
): Promise<TenantRoutingResult> {
  const cached = fromCache(hostname);
  if (cached) return cached;

  const match: TenantHostnameMatch = parseTenantHostname(hostname);

  if (match.kind === "root") {
    return intoCache(hostname, { kind: "root", tenantId: null, hostname });
  }

  if (match.kind === "unknown") {
    return intoCache(hostname, { kind: "not_found", hostname });
  }

  const supabase = buildEdgeSupabase(request);
  if (!supabase) {
    // No Supabase configured — treat as root so dev without env vars still
    // serves the storefront. Not cached (env may land later).
    return { kind: "root", tenantId: null, hostname };
  }

  if (match.kind === "subdomain") {
    // Look up by hostname directly (agency_domains stores the full hostname
    // including root). This avoids relying on an agencies.slug lookup which
    // would require joining a table without a public SELECT policy.
    const normalized = hostname.trim().toLowerCase();
    const { data, error } = await supabase
      .from("agency_domains")
      .select("tenant_id, hostname, status")
      .eq("hostname", normalized)
      .in("status", ["active", "ssl_provisioned", "verified"])
      .limit(1)
      .maybeSingle();

    if (error || !data) {
      return intoCache(hostname, { kind: "not_found", hostname });
    }
    return intoCache(hostname, {
      kind: "subdomain",
      tenantId: data.tenant_id as string,
      slug: match.slug,
      hostname: data.hostname as string,
    });
  }

  // match.kind === "custom" — Phase 4 scope excludes custom-domain verification.
  // Still look it up in case a row happens to exist (operator seeded manually),
  // but don't require it.
  const normalized = hostname.trim().toLowerCase();
  const { data, error } = await supabase
    .from("agency_domains")
    .select("tenant_id, hostname, status, kind")
    .eq("hostname", normalized)
    .eq("kind", "custom")
    .eq("status", "active")
    .limit(1)
    .maybeSingle();

  if (error || !data) {
    return intoCache(hostname, { kind: "not_found", hostname });
  }
  return intoCache(hostname, {
    kind: "custom",
    tenantId: data.tenant_id as string,
    hostname: data.hostname as string,
  });
}
