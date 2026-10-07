import { createServerClient, type CookieOptions } from "@supabase/ssr";
import type { NextRequest, NextResponse } from "next/server";

import { authCoordinationOptions } from "@/lib/supabase/auth-coordination";
import { cookieDomainForHost, isSupabaseAuthCookie } from "@/lib/supabase/cookie-domain";

import { clientAccountEnabledFor } from "./flag";

/**
 * Client-account session refresh on talent-site hosts (EPIC E, P0).
 *
 * A `kind: "talent_site"` host (book-<name>.tulala.digital, or a talent's own
 * domain) returns from `proxy.ts` through `talentSiteHostResponse` and never
 * runs `updateSession`. Until client accounts that was fine: nobody signs in
 * on a talent site. Once a client can, an expired access token is never
 * refreshed on these hosts, so the signed-in client looks logged out (or the
 * render path rotates the token itself, racing the browser).
 *
 * This wrapper adds ONLY the refresh, and only when all of these hold:
 *   1. `CLIENT_ACCOUNT_HOSTS` lists `talent` (off when unset, every env);
 *   2. the request carries a Supabase auth cookie (anonymous visitors cost
 *      nothing: no client is built, no network, no DB);
 *   3. the talent response is a page or passthrough (not a redirect, not 404).
 *
 * It deliberately does NOT call `updateSession`: that also runs auth routing
 * (redirects to /login, /onboarding), the access-profile RPC and the actor
 * header fast path, none of which belong on a public talent storefront.
 *
 * Security:
 *   - The talent response's request headers (incl. the server-set
 *     `x-impronta-talent-profile`, built from the sanitized inbound headers)
 *     are never touched. This only adds Set-Cookie (+ no-store) headers.
 *   - Cookie scope comes from the SERVER-RESOLVED host context, never from an
 *     inbound header. A custom domain is always host-only (no Domain
 *     attribute). A `*.tulala.digital` talent subdomain uses the shared
 *     `.tulala.digital` scope, the same one app.tulala.digital writes; writing
 *     host-only there would create the cross-scope duplicate that shadows the
 *     real session (see lib/supabase/middleware.ts). No cookie can ever be
 *     written for a different registrable domain.
 *   - Only Supabase auth cookie names are written.
 */

/**
 * Talent kind of the `CLIENT_ACCOUNT_HOSTS` comma list. With no argument this is
 * exactly `clientAccountEnabledFor("talent")` (the canonical flag, #2553); the
 * `raw` overload keeps the same parsing for unit tests: trim, case-insensitive,
 * unset or empty means OFF, no NODE_ENV default.
 */
export function clientAccountTalentHostsEnabled(raw?: string): boolean {
  if (raw === undefined) return clientAccountEnabledFor("talent");
  return raw.split(",").some((part) => part.trim().toLowerCase() === "talent");
}

export type TalentHostForSession = {
  hostname: string;
  hostKind?: "subdomain" | "custom";
};

/**
 * `.tulala.digital` (or `.lvh.me` locally) for a platform talent subdomain;
 * `undefined` (host-only) for a custom domain, an unknown kind, or any host
 * `cookieDomainForHost` does not share across.
 */
export function talentHostAuthCookieDomain(host: TalentHostForSession): string | undefined {
  if (host.hostKind !== "subdomain") return undefined;
  return cookieDomainForHost(host.hostname);
}

export function hasSupabaseAuthCookie(request: NextRequest): boolean {
  return request.cookies.getAll().some((c) => isSupabaseAuthCookie(c.name));
}

export type RefreshedAuthCookie = { name: string; value: string; options: CookieOptions };
export type TalentHostSessionRefresh = {
  cookies: RefreshedAuthCookie[];
  headers: Record<string, string>;
};

type ClientFactory = typeof createServerClient;

export type TalentHostSessionDeps = {
  enabled?: () => boolean;
  createClient?: ClientFactory;
  env?: { url?: string; anonKey?: string };
};

/**
 * Load the session from the request cookies and let auth-js refresh it when it
 * is expired or near expiry. `getSession` (not `getClaims`/`getUser`) because
 * the refresh is the only goal: no identity decision is made here, and a valid
 * token then costs no network call at all. Never mutates `request`.
 */
export async function refreshTalentHostSession(
  request: NextRequest,
  host: TalentHostForSession,
  deps: TalentHostSessionDeps = {},
): Promise<TalentHostSessionRefresh> {
  const url = deps.env ? deps.env.url : process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = deps.env ? deps.env.anonKey : process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const out: TalentHostSessionRefresh = { cookies: [], headers: {} };
  if (!url || !anonKey) return out;

  const domain = talentHostAuthCookieDomain(host);
  const jar = new Map(request.cookies.getAll().map((c) => [c.name, c.value]));
  const written = new Map<string, RefreshedAuthCookie>();
  const createClient = deps.createClient ?? createServerClient;

  const supabase = createClient(url, anonKey, {
    ...authCoordinationOptions(),
    cookies: {
      getAll() {
        return [...jar].map(([name, value]) => ({ name, value }));
      },
      setAll(cookiesToSet, headers) {
        for (const { name, value, options } of cookiesToSet) {
          jar.set(name, value);
          if (!isSupabaseAuthCookie(name)) continue;
          // Drop any library-supplied Domain; scope is decided here only.
          const scoped: CookieOptions = { ...(options ?? {}) };
          delete scoped.domain;
          if (domain) scoped.domain = domain;
          written.set(name, { name, value, options: scoped });
        }
        if (headers) Object.assign(out.headers, headers);
      },
    },
  });

  await supabase.auth.getSession().catch(() => null);
  out.cookies = [...written.values()];
  return out;
}

/**
 * Build the talent response exactly as before, then (flag on, auth cookie
 * present, page response) merge the refreshed auth cookies onto it.
 * `response.cookies.set` also feeds `x-middleware-set-cookie`, so the render
 * in this same request reads the fresh tokens instead of rotating again.
 */
export async function withTalentHostClientSession(
  request: NextRequest,
  host: TalentHostForSession,
  buildResponse: () => Promise<NextResponse>,
  deps: TalentHostSessionDeps = {},
): Promise<NextResponse> {
  const response = await buildResponse();
  if (!(deps.enabled ?? clientAccountTalentHostsEnabled)()) return response;
  if (!hasSupabaseAuthCookie(request)) return response;
  if (response.status >= 300 || response.headers.has("location")) return response;

  const refresh = await refreshTalentHostSession(request, host, deps);
  if (refresh.cookies.length === 0) return response;
  for (const c of refresh.cookies) response.cookies.set(c.name, c.value, c.options);
  // A response carrying a session token must never be cached by a CDN.
  for (const [key, value] of Object.entries(refresh.headers)) response.headers.set(key, value);
  return response;
}
