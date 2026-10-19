/**
 * Where POST /auth/sign-out lands: the home page in the language the visitor
 * was reading. Spanish is kept when the same-origin Referer is under `/es`
 * (public pages), or when the visitor's `locale` cookie is `es` (dashboards
 * such as /talent/today have no `/es` prefix, so the Referer cannot say).
 * Anything else lands on `/`.
 */
export function signOutRedirectPath(
  referer: string | null,
  requestUrl: string,
  localeCookie?: string | null,
): "/" | "/es" {
  if (localeCookie === "es") return "/es";
  if (!referer) return "/";
  try {
    const from = new URL(referer);
    if (from.origin !== new URL(requestUrl).origin) return "/";
    return /^\/es(?:\/|$)/.test(from.pathname) ? "/es" : "/";
  } catch {
    return "/";
  }
}
