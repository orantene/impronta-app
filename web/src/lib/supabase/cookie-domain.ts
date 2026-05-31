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
 *
 * Keeping the allow-list explicit bounds the blast radius to the two roots we
 * actually share sessions across.
 */

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
