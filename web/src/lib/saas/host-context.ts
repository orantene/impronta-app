import { createServerClient } from "@supabase/ssr";
import type { NextRequest } from "next/server";

/**
 * SaaS unified host resolver — THE single source of truth for
 * hostname → (context, tenant) mapping.
 *
 * Reads exclusively from `public.agency_domains`. No hostnames are
 * hardcoded in code — adding / rotating a domain is a DB change only.
 *
 * Four production contexts (L2, L37):
 *   - "marketing" → public SaaS marketing site, no tenant scope
 *   - "app"       → internal admin / coordination app, no tenant scope
 *   - "hub"       → global hub (cross-tenant discovery), no tenant scope
 *   - "agency"    → a specific tenant's storefront (subdomain or custom)
 *
 * A 5th kind — "not_found" — is returned when the hostname is not
 * registered. Middleware fails hard (HTTP 404) on this result; there is
 * no fallback to tenant #1 or to any other context.
 *
 * Results are cached in-process for 60s per edge worker to avoid
 * hammering the DB on hot paths. `agency_domains` has a public SELECT
 * policy for `status = 'active'`, so this runs with the anon key and
 * needs no session.
 */

export type HostContext =
  | { kind: "marketing"; tenantId: null; hostname: string }
  | { kind: "app"; tenantId: null; hostname: string }
  // Phase 5/6 M1 — the hub IS a first-class tenant on the org abstraction
  // (kind='hub' agency seeded in 20260625100000). Its tenantId lets the
  // public render path call the same CMS reads (loadPublicHomepage,
  // identity, branding, menus) that agency tenants use. The host kind
  // stays 'hub' so the surface allow-list and dispatch keep their
  // existing semantics — only data access is unified.
  | { kind: "hub"; tenantId: string; hostname: string }
  | { kind: "agency"; tenantId: string; hostname: string; domainKind: "subdomain" | "custom" }
  | { kind: "not_found"; tenantId: null; hostname: string };

type CacheEntry = { value: HostContext; expiresAt: number };
const cache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 60 * 1000;

function normalize(host: string): string {
  const stripped = host.split(":")[0] ?? host;
  return stripped.trim().toLowerCase();
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
        // Host resolution never writes cookies.
      },
    },
  });
}

/**
 * Resolve a hostname to its route context via a DB lookup on
 * `public.agency_domains`. Returns `{ kind: 'not_found' }` when the
 * hostname is not registered — caller is responsible for the 404.
 */
export async function resolveTenantContext(
  request: NextRequest,
  hostInput: string,
): Promise<HostContext> {
  const hostname = normalize(hostInput);
  if (!hostname) {
    return { kind: "not_found", tenantId: null, hostname: "" };
  }

  const cached = cache.get(hostname);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.value;
  }

  const supabase = buildEdgeSupabase(request);
  if (!supabase) {
    // No Supabase env wired — dev without config. Fail-closed (not_found)
    // rather than inventing a fallback context. The developer must finish
    // env setup before the app becomes reachable.
    return { kind: "not_found", tenantId: null, hostname };
  }

  const { data, error } = await supabase
    .from("agency_domains")
    .select("kind, tenant_id, hostname, status")
    .eq("hostname", hostname)
    .in("status", ["active", "ssl_provisioned", "verified"])
    .limit(1)
    .maybeSingle();

  let value: HostContext;
  if (error || !data) {
    value = { kind: "not_found", tenantId: null, hostname };
  } else {
    switch (data.kind) {
      case "marketing":
        value = { kind: "marketing", tenantId: null, hostname: data.hostname };
        break;
      case "app":
        value = { kind: "app", tenantId: null, hostname: data.hostname };
        break;
      case "hub":
        // After M0 step-5, every kind='hub' agency_domains row is bound
        // to the hub agency UUID. A NULL tenant_id on a hub row would
        // mean unfinished M0 migration — fail to not_found rather than
        // silently render with `null`.
        if (!data.tenant_id) {
          value = { kind: "not_found", tenantId: null, hostname };
        } else {
          value = { kind: "hub", tenantId: data.tenant_id as string, hostname: data.hostname };
        }
        break;
      case "subdomain":
      case "custom":
        if (!data.tenant_id) {
          value = { kind: "not_found", tenantId: null, hostname };
        } else {
          value = {
            kind: "agency",
            tenantId: data.tenant_id as string,
            hostname: data.hostname,
            domainKind: data.kind,
          };
        }
        break;
      default:
        value = { kind: "not_found", tenantId: null, hostname };
    }
  }

  cache.set(hostname, { value, expiresAt: Date.now() + CACHE_TTL_MS });
  return value;
}

/**
 * Header constants used to communicate host context from middleware to
 * downstream server code. Always defined on internal requests; never
 * trusted from the external client (middleware strips then sets).
 */
export const HOST_CONTEXT_HEADER = "x-impronta-host-context";
export const HOST_NAME_HEADER = "x-impronta-host-name";
