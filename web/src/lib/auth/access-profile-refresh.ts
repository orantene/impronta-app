/**
 * Cookie that tells Edge middleware its 60 s access-profile memo is stale
 * after onboarding changes `app_role` / `account_status`. The memo lives in
 * the proxy isolate of whichever instance serves the next request; a route
 * handler or server action on another instance cannot delete it, so the
 * cookie is the signal.
 *
 * Two value shapes:
 *   - "1" (legacy one-shot): drop the memo on the next request, then clear.
 *   - a millisecond timestamp (stamp): any memo entry recorded BEFORE the
 *     stamp is stale on EVERY instance until the cookie expires. This is a
 *     version on the memo key, so it survives requests landing on instances
 *     that never saw the bust.
 *
 * The cookie is scoped with the same parent domain as the Supabase auth
 * cookies (`cookieDomainForHost`), so a stamp set on the marketing apex
 * (tulala.digital, where the onboarding build runs) reaches app.tulala.digital.
 */
import { cookieDomainForHost } from "@/lib/supabase/cookie-domain";

export const ACCESS_PROFILE_REFRESH_COOKIE = "tulala_access_profile_refresh";
export const ACCESS_PROFILE_REFRESH_VALUE = "1";
/** How long a stamp keeps invalidating older memo entries. */
export const ACCESS_PROFILE_REFRESH_MAX_AGE_S = 120;

export function wantsAccessProfileRefresh(value: string | undefined | null): boolean {
  return value === ACCESS_PROFILE_REFRESH_VALUE || accessProfileRefreshStamp(value) !== null;
}

/** The stamp (ms) carried by the cookie, or null for absent / legacy / junk. */
export function accessProfileRefreshStamp(value: string | undefined | null): number | null {
  if (!value || !/^[0-9]{10,16}$/.test(value)) return null;
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** True when a memo entry recorded at `entryAt` may still be served. */
export function isAccessProfileMemoUsable(
  entryAt: number,
  now: number,
  ttlMs: number,
  cookieValue: string | undefined | null,
): boolean {
  if (now - entryAt >= ttlMs) return false;
  if (cookieValue === ACCESS_PROFILE_REFRESH_VALUE) return false;
  const stamp = accessProfileRefreshStamp(cookieValue);
  if (stamp !== null && entryAt <= stamp) return false;
  return true;
}

export type AccessProfileRefreshCookie = {
  name: string;
  value: string;
  options: {
    path: "/";
    maxAge: number;
    httpOnly: true;
    sameSite: "lax";
    secure: boolean;
    domain?: string;
  };
};

/**
 * The stamped refresh cookie for a request host. Production hosts under
 * tulala.digital get `domain: ".tulala.digital"`; localhost stays host-only.
 */
export function buildAccessProfileRefreshCookie(
  host: string | null | undefined,
  now: number = Date.now(),
): AccessProfileRefreshCookie {
  const domain = cookieDomainForHost(host);
  // Secure only on the production parent: lvh.me / localhost dev is plain http.
  const secure = domain === ".tulala.digital";
  return {
    name: ACCESS_PROFILE_REFRESH_COOKIE,
    value: String(now),
    options: {
      path: "/",
      maxAge: ACCESS_PROFILE_REFRESH_MAX_AGE_S,
      httpOnly: true,
      sameSite: "lax",
      secure,
      ...(domain ? { domain } : {}),
    },
  };
}
