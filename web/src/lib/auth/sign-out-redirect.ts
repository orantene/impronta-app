/**
 * Where POST /auth/sign-out lands: the home page in the language the visitor
 * was reading. Only a same-origin Referer under `/es` keeps Spanish; anything
 * else (no Referer, another origin, an English page) lands on `/`.
 */
export function signOutRedirectPath(referer: string | null, requestUrl: string): "/" | "/es" {
  if (!referer) return "/";
  try {
    const from = new URL(referer);
    if (from.origin !== new URL(requestUrl).origin) return "/";
    return /^\/es(?:\/|$)/.test(from.pathname) ? "/es" : "/";
  } catch {
    return "/";
  }
}
