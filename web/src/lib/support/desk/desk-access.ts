/**
 * Pure gate for Support Desk `/desk` access decisions.
 *
 * Flag off → hide the surface (soft 404).
 * Unauthenticated → login redirect (caller).
 * Authenticated non–platform-admin → honest forbidden (never soft 404).
 */

export type DeskAccessDecision =
  | { allow: true }
  | { allow: false; reason: "flag_off" }
  | { allow: false; reason: "unauthenticated" }
  | { allow: false; reason: "forbidden" };

export function decideDeskAccess(input: {
  flagEnabled: boolean;
  hasUser: boolean;
  isPlatformAdmin: boolean;
}): DeskAccessDecision {
  if (!input.flagEnabled) return { allow: false, reason: "flag_off" };
  if (!input.hasUser) return { allow: false, reason: "unauthenticated" };
  if (!input.isPlatformAdmin) return { allow: false, reason: "forbidden" };
  return { allow: true };
}

/**
 * Language for the forbidden page. `/desk` has no locale prefix, so the
 * request locale is the platform default unless the visitor chose one (the
 * locale cookie). Without that choice, the signed-in person's saved language
 * wins, so a Spanish talent is not told "no access" in English.
 */
export function deskForbiddenLocale(input: {
  cookieLocale: string | null | undefined;
  savedLocale: string | null | undefined;
  requestLocale: string;
}): string {
  if (input.cookieLocale?.trim()) return input.requestLocale;
  const saved = input.savedLocale?.trim().toLowerCase();
  return saved === "es" || saved === "en" ? saved : input.requestLocale;
}

/**
 * One-shot cookie rescope on Desk hosts: a host-only talent/client session can
 * shadow a parent-domain (`Domain=.tulala.digital`) platform-admin session.
 * Middleware clears host-only auth cookies once and retries `/desk`.
 */
export function shouldAttemptDeskAuthRescope(input: {
  isSupportDeskHost: boolean;
  pathname: string;
  hasUser: boolean;
  isPlatformAdmin: boolean;
  alreadyRescoped: boolean;
}): boolean {
  if (!input.isSupportDeskHost || !input.hasUser || input.alreadyRescoped) {
    return false;
  }
  if (input.isPlatformAdmin) return false;
  const p = input.pathname;
  return p === "/desk" || p.startsWith("/desk/");
}

/** Cookie name for the one-shot Desk auth rescope guard. */
export const DESK_AUTH_RESCOPE_COOKIE = "impronta_desk_auth_rescope";
