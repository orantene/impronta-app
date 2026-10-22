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

export type SignInLocalePlan = "keep" | "reset" | "keep_and_stamp";

/**
 * TUL-1252: what to do with the locale cookies at sign-in.
 *
 * `shouldResetLocaleCookiesOnSignIn` alone wiped the Spanish a client had just
 * chosen on `/es/login` (cookie present, deliberate, but owner unstamped on a
 * fresh browser), so `/client` rendered in English. A deliberate cookie on a
 * browser with NO owner stamp was written by the person now signing in (the
 * login page itself stamps it), so it is kept and the owner is stamped. A
 * cookie owned by a DIFFERENT user is still dropped (F132), and so is an
 * unowned auto cookie (bookkeeping, not a choice).
 */
export function planLocaleCookiesOnSignIn(input: {
  cookieOwner: string | null | undefined;
  userId: string;
  cookieLocale: string | null | undefined;
  cookieIsAuto: boolean;
}): SignInLocalePlan {
  if (!shouldResetLocaleCookiesOnSignIn(input)) return "keep";
  const unowned = !input.cookieOwner;
  const deliberate = Boolean(input.cookieLocale) && !input.cookieIsAuto;
  return unowned && deliberate ? "keep_and_stamp" : "reset";
}
