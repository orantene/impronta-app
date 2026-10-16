/**
 * The two sign-out routes (S1, TUL-708). Both are handled by
 * `app/auth/sign-out/route.ts`; `/auth/client-sign-out` is the alias that also
 * works on talent-site hosts, where every other `/auth/*` path is 404.
 *
 * `updateSession` must NOT run its session refresh on these paths: a refresh
 * there re-issues a fresh auth cookie on the very response that is expiring
 * it, and because middleware verifies the JWT locally (`getClaims`), that
 * re-minted access token keeps the user signed in for its whole lifetime even
 * though the refresh token was revoked a moment later.
 */
export const SIGN_OUT_PATH = "/auth/sign-out";
export const CLIENT_SIGN_OUT_PATH = "/auth/client-sign-out";

export function isSignOutPath(pathname: string): boolean {
  return pathname === SIGN_OUT_PATH || pathname === CLIENT_SIGN_OUT_PATH;
}

/** Pages whose HTML depends on who is signed in and must never be cached. */
export function isSessionSensitivePage(pathname: string): boolean {
  return /^(?:\/[a-z]{2})?\/(?:login|account)(?:\/|$)/.test(pathname) || isSignOutPath(pathname);
}
