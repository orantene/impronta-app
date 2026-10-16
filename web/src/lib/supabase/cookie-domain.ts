/**
 * Cross-subdomain auth cookie scoping.
 *
 * The platform runs across sibling subdomains of one registrable domain:
 *   - tulala.digital            (marketing)
 *   - app.tulala.digital        (workspace / talent / client dashboards)
 *   - <tenant>.tulala.digital   (tenant storefronts)
 *
 * Supabase auth cookies are host-only by default, so a session created on the
 * marketing host is invisible on the app host. That breaks the in-place
 * talent registration modal (register on tulala.digital → land logged-in on
 * app.tulala.digital) and any cross-surface "you're signed in" recognition.
 *
 * `cookieDomainForHost()` returns the leading-dot parent domain to scope auth
 * cookies to — but ONLY for the known first-party multi-subdomain roots.
 * Everything else returns `undefined`, i.e. cookies stay host-only exactly as
 * before:
 *   - localhost / raw IPs / *.local         → host-only (a dotted domain on
 *                                              localhost won't set)
 *   - *.vercel.app preview deploys           → host-only
 *   - tenant CUSTOM domains (improntamodels.com, …) → host-only (single-host
 *                                              storefronts; their auth stays
 *                                              local to that domain)
 *   - Support Desk hosts (support.tulala.digital, desk.tulala.digital, …)
 *     → host-only. Desk has its own login; never widen to `.tulala.digital`
 *     (Phase 1a / Oran binding).
 *
 * Keeping the allow-list explicit bounds the blast radius to the two roots we
 * actually share sessions across.
 */

import { isHostScopedAuthHost } from "@/lib/support/desk-hosts";

/** Leading-dot parent domains we share auth cookies across. */
const SHARED_COOKIE_PARENTS = [".tulala.digital", ".lvh.me"] as const;

/**
 * Returns the cookie `domain` (e.g. ".tulala.digital") a given request host
 * should use for shared auth cookies, or `undefined` to leave cookies
 * host-only (the prior default).
 */
export function cookieDomainForHost(
  host: string | null | undefined,
): string | undefined {
  if (!host) return undefined;
  // Strip port + normalise.
  const h = (host.split(":")[0] ?? "").trim().toLowerCase();
  if (!h) return undefined;
  // Never scope localhost, raw IPs, or *.local — a dotted Domain attribute
  // there is invalid and the cookie silently fails to set.
  if (h === "localhost" || h.endsWith(".local") || /^[0-9.]+$/.test(h)) {
    return undefined;
  }
  // Support Desk: own login, host-scoped session only. Do not widen.
  if (isHostScopedAuthHost(h)) return undefined;
  for (const parent of SHARED_COOKIE_PARENTS) {
    const root = parent.slice(1); // ".tulala.digital" → "tulala.digital"
    if (h === root || h.endsWith(parent)) {
      return parent;
    }
  }
  // Custom domains, *.vercel.app, anything else → host-only (unchanged).
  return undefined;
}

/**
 * Supabase SSR auth cookies are named `sb-<ref>-auth-token`, optionally
 * chunked (`…-auth-token.0`, `.1`), plus a transient PKCE `…-code-verifier`
 * during OAuth. Only these need the shared parent domain; the guest cookie and
 * any unrelated cookies are left untouched.
 */
export function isSupabaseAuthCookie(name: string): boolean {
  if (!name.startsWith("sb-")) return false;
  return name.includes("-auth-token") || name.includes("-code-verifier");
}

/** Parent domains we may need to expire when Desk writes host-only auth. */
export const SHARED_AUTH_COOKIE_PARENTS = SHARED_COOKIE_PARENTS;

type CookieSetter = {
  set: (
    name: string,
    value: string,
    options?: {
      maxAge?: number;
      path?: string;
      domain?: string;
      sameSite?: "lax" | "strict" | "none";
      httpOnly?: boolean;
      secure?: boolean;
    },
  ) => unknown;
};

/**
 * Expire parent-domain Supabase auth cookies (`.tulala.digital` / `.lvh.me`)
 * so a host-only Desk session is not shadowed by an app/talent session.
 * Call only on Support Desk hosts — never widens Desk cookies.
 */
export function expireParentDomainAuthCookies(
  cookieJar: CookieSetter,
  names: Iterable<string>,
): void {
  for (const name of names) {
    if (!isSupabaseAuthCookie(name)) continue;
    for (const domain of SHARED_COOKIE_PARENTS) {
      cookieJar.set(name, "", { maxAge: 0, path: "/", domain });
    }
  }
}

/** Chunk suffixes @supabase/ssr may write for a large session. */
const AUTH_CHUNK_SUFFIXES = ["", ".0", ".1", ".2", ".3", ".4"] as const;

/** Base name of an auth cookie: `sb-x-auth-token.1` -> `sb-x-auth-token`. */
function authCookieBase(name: string): string {
  return name.replace(/\.\d+$/, "");
}

/** Every auth cookie name (base + chunks) a browser may hold for `names`. */
function authCookieNamesWithChunks(names: Iterable<string>): string[] {
  const out = new Set<string>();
  for (const name of names) {
    if (!isSupabaseAuthCookie(name)) continue;
    const base = authCookieBase(name);
    if (base.includes("-code-verifier")) {
      out.add(name);
      continue;
    }
    for (const suffix of AUTH_CHUNK_SUFFIXES) out.add(`${base}${suffix}`);
  }
  return [...out];
}

/**
 * Every cookie scope a browser may hold an auth cookie at on `host`
 * (TUL-621): host-only (`undefined`), then each Domain from the host itself
 * up to the shared root, e.g. app.staging.tulala.digital ->
 * [host-only, .app.staging.tulala.digital, .staging.tulala.digital,
 * .tulala.digital]. Hosts we never share across stay host-only only.
 */
export function authCookieScopeVariants(
  host: string | null | undefined,
): (string | undefined)[] {
  const canonical = cookieDomainForHost(host);
  if (!canonical) return [undefined];
  const h = (String(host).split(":")[0] ?? "").trim().toLowerCase();
  const out: (string | undefined)[] = [undefined];
  const labels = h.split(".");
  const rootLabels = canonical.slice(1).split(".").length;
  for (let i = 0; labels.length - i > rootLabels; i++) {
    out.push(`.${labels.slice(i).join(".")}`);
  }
  out.push(canonical);
  return out;
}

function expiryHeader(name: string, domain: string | undefined): string {
  return domain
    ? `${name}=; Path=/; Max-Age=0; Domain=${domain}`
    : `${name}=; Path=/; Max-Age=0`;
}

/**
 * Raw `Set-Cookie` header values that expire a Supabase auth cookie at EVERY
 * scope a browser may hold it (host-only, intermediate parents such as
 * `.staging.tulala.digital`, and the shared `.tulala.digital`) and every
 * chunk. A name-keyed cookie jar carries only one scope per name, so a
 * sign-out through it leaves the other scopes alive and the user stays signed
 * in (TUL-120 C1-03, TUL-708).
 */
export function authCookieExpiryHeaders(
  names: Iterable<string>,
  host: string | null | undefined,
): string[] {
  const scopes = authCookieScopeVariants(host);
  const out: string[] = [];
  for (const name of authCookieNamesWithChunks(names)) {
    for (const domain of scopes) out.push(expiryHeader(name, domain));
  }
  return out;
}

/**
 * Expiry headers for every scope EXCEPT the canonical one (TUL-621). Used to
 * sweep a cross-scope duplicate: the browser sends both copies, the server may
 * read the stale one (an older client session) instead of the fresh sign-in,
 * which is always written at the canonical scope. Empty on host-only hosts.
 */
export function nonCanonicalAuthCookieExpiryHeaders(
  names: Iterable<string>,
  host: string | null | undefined,
): string[] {
  const canonical = cookieDomainForHost(host);
  if (!canonical) return [];
  const scopes = authCookieScopeVariants(host).filter((d) => d !== canonical);
  const out: string[] = [];
  for (const name of authCookieNamesWithChunks(names)) {
    for (const domain of scopes) out.push(expiryHeader(name, domain));
  }
  return out;
}

/**
 * Auth cookie names that appear more than once in a raw Cookie header: the
 * browser holds the same cookie at two scopes (TUL-621). Returns base names.
 */
export function duplicateAuthCookieNames(cookieHeader: string | null | undefined): string[] {
  const seen = new Set<string>();
  const dup = new Set<string>();
  for (const part of (cookieHeader ?? "").split(";")) {
    const p = part.trim();
    const i = p.indexOf("=");
    const name = i < 0 ? p : p.slice(0, i);
    if (!isSupabaseAuthCookie(name)) continue;
    if (seen.has(name)) dup.add(authCookieBase(name));
    seen.add(name);
  }
  return [...dup];
}
