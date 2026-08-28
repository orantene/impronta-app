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
  | {
      kind: "agency";
      tenantId: string;
      hostname: string;
      domainKind: "subdomain" | "custom" | "path";
      isPrimary: boolean;
      canonicalHost: string | null;
      canonicalHostKind: "subdomain" | "custom" | null;
      /**
       * Phase 4 — denormalized from agency_domains.tenant_slug.
       * Set by the middleware and propagated via x-impronta-tenant-slug header.
       * Used by layouts to redirect /admin → /<slug>/admin without a DB lookup.
       */
      tenantSlug: string;
    }
  // A custom domain pointed at a talent's published Max site. Resolved via the
  // `talent_site_domain_lookup` RPC only AFTER `agency_domains` misses, so an
  // agency host always wins. Carries the talent_profile_id; the root render
  // (`app/page.tsx`) calls `renderTalentMaxSite({ talentProfileId })`.
  | {
      kind: "talent_site";
      tenantId: null;
      hostname: string;
      talentProfileId: string;
    }
  | { kind: "not_found"; tenantId: null; hostname: string };

type CacheEntry = { value: HostContext; expiresAt: number };

/**
 * Bifurcated bounded LRU.
 *
 * Hosts that resolve to a real context (marketing/app/hub/agency) live in
 * `hitCache`. Hosts that miss `agency_domains` ("not_found") live in
 * `missCache`. Both Maps preserve insertion order, so the oldest entry is
 * the first iterator key; each get on a still-valid entry refreshes
 * recency by delete+set.
 *
 * Why bifurcate: a random-hostname scanner can drive thousands of unique
 * `not_found` lookups in seconds. With one shared Map, those misses would
 * evict legitimate hosts and force re-reads of the DB on every real
 * request. The miss bucket caps at a small fraction of the hit bucket so
 * scanners are absorbed without disturbing real traffic. The miss-cache
 * still serves its purpose — it short-circuits repeat scanner hits within
 * the 60s TTL.
 */
const CACHE_TTL_MS = 60 * 1000;
const HIT_CACHE_MAX_ENTRIES = 256;
const MISS_CACHE_MAX_ENTRIES = 64;
const hitCache = new Map<string, CacheEntry>();
const missCache = new Map<string, CacheEntry>();

function bucketFor(value: HostContext): Map<string, CacheEntry> {
  return value.kind === "not_found" ? missCache : hitCache;
}

function cacheGet(host: string): HostContext | null {
  // Look in both buckets — we don't know yet whether `host` is a hit or
  // miss. The buckets are disjoint by hostname (a host moves from miss
  // to hit on first successful resolve via cacheSet, which deletes from
  // the wrong bucket before inserting).
  let entry = hitCache.get(host);
  let bucket: Map<string, CacheEntry> | null = entry ? hitCache : null;
  if (!entry) {
    entry = missCache.get(host);
    bucket = entry ? missCache : null;
  }
  if (!entry || !bucket) return null;
  if (entry.expiresAt <= Date.now()) {
    bucket.delete(host);
    return null;
  }
  // refresh LRU recency
  bucket.delete(host);
  bucket.set(host, entry);
  return entry.value;
}

function cacheSet(host: string, value: HostContext): void {
  // Migrate across buckets if a previously-missing host now resolves
  // (or vice versa).
  hitCache.delete(host);
  missCache.delete(host);

  const bucket = bucketFor(value);
  const cap =
    bucket === hitCache ? HIT_CACHE_MAX_ENTRIES : MISS_CACHE_MAX_ENTRIES;
  bucket.set(host, { value, expiresAt: Date.now() + CACHE_TTL_MS });
  while (bucket.size > cap) {
    const oldestKey = bucket.keys().next().value;
    if (oldestKey === undefined) break;
    bucket.delete(oldestKey);
  }
}

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

  const cached = cacheGet(hostname);
  if (cached) return cached;

  const supabase = buildEdgeSupabase(request);
  if (!supabase) {
    // No Supabase env wired — dev without config. Fail-closed (not_found)
    // rather than inventing a fallback context. The developer must finish
    // env setup before the app becomes reachable.
    return { kind: "not_found", tenantId: null, hostname };
  }

  const { data, error } = await supabase
    .from("agency_domains")
    .select("kind, tenant_id, hostname, status, tenant_slug, is_primary")
    .eq("hostname", hostname)
    .in("status", ["active", "ssl_provisioned", "verified"])
    .limit(1)
    .maybeSingle();

  let value: HostContext;
  if (error || !data) {
    // The host is not a registered `agency_domains` host. Before failing to
    // `not_found`, check whether it is a talent's ACTIVE custom domain. This is
    // strictly a second resolver — an agency host always resolves above first,
    // so a talent domain can never shadow an agency host. Degrade-safe: any RPC
    // error / empty result / malformed row falls through to the existing
    // not_found (or dev-localhost) behavior. NEVER mis-serves another tenant.
    const talentSite = await resolveTalentSiteContext(supabase, hostname);
    if (talentSite) {
      value = talentSite;
    } else if (
      // `next dev` + Playwright use `localhost` / `127.0.0.1` (see
      // `20260922100000_agency_domains_localhost_app_dev.sql`). Until that row
      // exists on a linked DB, treat loopback as `app` in development only so
      // `proxy.ts` path-based tenant dispatch (`/impronta`, …) can run.
      process.env.NODE_ENV === "development" &&
      (hostname === "localhost" || hostname === "127.0.0.1")
    ) {
      value = { kind: "app", tenantId: null, hostname };
    } else {
      value = { kind: "not_found", tenantId: null, hostname };
    }
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
          let canonicalHost: string | null = null;
          let canonicalHostKind: "subdomain" | "custom" | null = null;
          if (!data.is_primary) {
            const primary = await supabase
              .from("agency_domains")
              .select("hostname, kind")
              .eq("tenant_id", data.tenant_id)
              .in("kind", ["subdomain", "custom"])
              .eq("is_primary", true)
              .in("status", ["active", "ssl_provisioned", "verified"])
              .limit(1)
              .maybeSingle();

            if (!primary.error) {
              canonicalHost = (primary.data?.hostname as string | undefined) ?? null;
              canonicalHostKind = (primary.data?.kind as "subdomain" | "custom" | undefined) ?? null;
            }
          }

          value = {
            kind: "agency",
            tenantId: data.tenant_id as string,
            hostname: data.hostname,
            domainKind: data.kind,
            isPrimary: Boolean(data.is_primary),
            canonicalHost,
            canonicalHostKind,
            // Phase 4 — denormalized slug from agency_domains.tenant_slug.
            // Falls back to empty string if the column is NULL (pre-migration rows).
            tenantSlug: (data.tenant_slug as string | null) ?? "",
          };
        }
        break;
      default:
        value = { kind: "not_found", tenantId: null, hostname };
    }
  }

  cacheSet(hostname, value);
  return value;
}

/**
 * Is this profile code on the tenant's PUBLICLY VISIBLE roster?
 *
 * WHY THIS LIVES IN THE EDGE LAYER
 * ────────────────────────────────
 * The page-level gate (`_guards/agency-roster-visibility`) renders the right
 * thing — not-found body, noindex, no Inquire CTA — but it cannot fix the
 * STATUS. `t/[profileCode]/loading.tsx` puts an implicit Suspense boundary on
 * the segment, so Next flushes the shell before any server component resolves
 * and a later notFound() cannot retract a 200 already on the wire. Measured,
 * not assumed. That leaves a soft 404: not-found content served as 200, which
 * is what crawlers and link-preview bots read.
 *
 * Deciding it here, before the response starts, is the only way to send a real
 * 404 without deleting the loading skeleton for every talent page.
 *
 * COST: this is a hot path, so the answer is cached per (tenant, code) on the
 * SAME 60s TTL as the host lookup above. Steady state is one query per profile
 * per minute per worker, not one per request. A failure returns `true` —
 * fail-OPEN — because a transient DB blip must never 404 a real profile; the
 * page-level gate is still there and will render the not-found body if the
 * talent genuinely is off-roster.
 */
export async function isProfileCodeOnTenantRoster(
  request: NextRequest,
  tenantId: string,
  profileCode: string,
): Promise<boolean> {
  const key = `${tenantId}/_roster/${profileCode.toLowerCase()}`;
  const cached = cacheGet(key);
  if (cached) return cached.kind !== "not_found";

  const supabase = buildEdgeSupabase(request);
  if (!supabase) return true; // no client — fail open, never hide a real page

  try {
    const { data, error } = await supabase
      .from("talent_profiles")
      .select("id, agency_talent_roster!inner(tenant_id, status, agency_visibility, talent_site_hidden)")
      .eq("profile_code", profileCode)
      .neq("profile_kind", "resource")
      .eq("agency_talent_roster.tenant_id", tenantId)
      .eq("agency_talent_roster.status", "active")
      .in("agency_talent_roster.agency_visibility", ["site_visible", "featured"])
      .eq("agency_talent_roster.talent_site_hidden", false)
      .limit(1)
      .maybeSingle();

    if (error) return true; // fail open

    const onRoster = Boolean(data);
    // Reuse the host cache's two buckets: a hit means "serve it", a miss means
    // "404 it". Nothing else reads these keys — they are namespaced by /_roster/.
    cacheSet(
      key,
      onRoster
        ? { kind: "app", tenantId: null, hostname: key }
        : { kind: "not_found", tenantId: null, hostname: key },
    );
    return onRoster;
  } catch {
    return true; // fail open
  }
}

export type TalentSiteEdgeClient = {
  rpc: (
    fn: "talent_site_domain_lookup",
    args: { p_host: string },
  ) => PromiseLike<{
    data:
      | Array<{ talent_profile_id?: string | null }>
      | { talent_profile_id?: string | null }
      | null;
    error: unknown;
  }>;
};

/**
 * Resolve a hostname to a talent custom-domain context via the
 * `talent_site_domain_lookup` RPC (SECURITY DEFINER). The RPC returns a row
 * ONLY when the domain is `active`, the talent is not hidden, and the site is
 * published — so a non-active row, a hidden talent, or an unpublished site all
 * yield null here and the caller falls through to `not_found`.
 *
 * Hardened: the RPC call is wrapped so any throw / error / shape surprise
 * returns null. A talent domain is NEVER allowed to mis-serve — a null result
 * is indistinguishable from "host not registered" downstream.
 */
export async function resolveTalentSiteContext(
  supabase: TalentSiteEdgeClient,
  hostname: string,
): Promise<Extract<HostContext, { kind: "talent_site" }> | null> {
  try {
    const { data, error } = await supabase.rpc("talent_site_domain_lookup", {
      p_host: hostname,
    });
    if (error) return null;
    const row = Array.isArray(data) ? data[0] : data;
    const talentProfileId = row?.talent_profile_id;
    if (!talentProfileId || typeof talentProfileId !== "string") return null;
    return { kind: "talent_site", tenantId: null, hostname, talentProfileId };
  } catch {
    return null;
  }
}

/**
 * Phase 3.15 — resolve `/<tenantSlug>/...` public workspace paths on hub /
 * marketing hosts. This intentionally does not use agencies directly from
 * middleware; the SECURITY DEFINER RPC exposes only the small public slug →
 * tenant mapping needed for path-based storefront dispatch.
 */
export async function resolveTenantContextFromPathSlug(
  request: NextRequest,
  hostInput: string,
  slugInput: string,
): Promise<HostContext | null> {
  const hostname = normalize(hostInput);
  const slug = slugInput.trim().toLowerCase();
  if (!hostname || !slug) return null;

  const cacheKey = `${hostname}/_path/${slug}`;
  const cached = cacheGet(cacheKey);
  if (cached) return cached.kind === "not_found" ? null : cached;

  const supabase = buildEdgeSupabase(request);
  if (!supabase) return null;

  const { data, error } = await supabase
    .rpc("resolve_public_tenant_by_slug", { p_slug: slug });

  let value: HostContext;
  const row = Array.isArray(data) ? data[0] : null;
  if (error || !row?.tenant_id || !row?.tenant_slug) {
    // Backward-compatible fallback for local DBs that have not applied the
    // RPC migration yet but do have an active agency_domains tenant_slug row.
    const fallback = await supabase
      .from("agency_domains")
      .select("tenant_id, tenant_slug")
      .eq("tenant_slug", slug)
      .in("kind", ["subdomain", "custom"])
      .in("status", ["active", "ssl_provisioned", "verified"])
      .limit(1)
      .maybeSingle();

    if (fallback.error || !fallback.data?.tenant_id || !fallback.data?.tenant_slug) {
      value = { kind: "not_found", tenantId: null, hostname };
    } else {
      value = {
        kind: "agency",
        tenantId: fallback.data.tenant_id as string,
        hostname,
        domainKind: "path",
        isPrimary: false,
        canonicalHost: null,
        canonicalHostKind: null,
        tenantSlug: fallback.data.tenant_slug as string,
      };
    }
  } else {
    value = {
      kind: "agency",
      tenantId: row.tenant_id as string,
      hostname,
      domainKind: "path",
      isPrimary: false,
      canonicalHost: null,
      canonicalHostKind: null,
      tenantSlug: row.tenant_slug as string,
    };
  }

  cacheSet(cacheKey, value);
  return value.kind === "not_found" ? null : value;
}

/**
 * Header constants used to communicate host context from middleware to
 * downstream server code. Always defined on internal requests; never
 * trusted from the external client (middleware strips then sets).
 */
export const HOST_CONTEXT_HEADER = "x-impronta-host-context";
export const HOST_NAME_HEADER = "x-impronta-host-name";
/**
 * Phase 4 — tenant slug header. Set for agency hosts. Lets downstream
 * layouts redirect /admin → /<slug>/admin without a DB lookup. Derived
 * from agency_domains.tenant_slug (denormalized, backfilled from agencies.slug).
 */
export const HOST_TENANT_SLUG_HEADER = "x-impronta-tenant-slug";
/**
 * Talent custom-domain context — carries the resolved talent_profile_id for a
 * `kind: "talent_site"` host so the root render can call
 * `renderTalentMaxSite({ talentProfileId })` without re-resolving the host.
 * Set ONLY for talent_site hosts; stripped on every other context so a client
 * can never spoof a talent profile id.
 */
export const HOST_TALENT_PROFILE_HEADER = "x-impronta-talent-profile";
