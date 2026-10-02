/**
 * F132 - pure rule for "a different person just signed in on this browser".
 * The locale cookie is per browser; it belongs to `LOCALE_OWNER_COOKIE`'s user.
 * Anyone else signing in must not inherit it.
 */
export function shouldResetLocaleCookiesOnSignIn(input: {
  cookieOwner: string | null | undefined;
  userId: string;
}): boolean {
  return Boolean(input.userId) && input.cookieOwner !== input.userId;
}
