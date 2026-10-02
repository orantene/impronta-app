import "server-only";

import { cookies } from "next/headers";

import { LOCALE_AUTO_COOKIE, LOCALE_OWNER_COOKIE } from "@/i18n/locale-cookies";
import { LOCALE_COOKIE, localeCookieOptions } from "@/i18n/locale-middleware";
import { shouldResetLocaleCookiesOnSignIn } from "@/i18n/locale-owner";

/**
 * F132 - after a successful sign-in, drop any cookie-derived language that
 * belongs to someone else (or to nobody we can name) and stamp the signed-in
 * user as owner. The next surface then falls back to that user's own profile
 * language. Same user signing in again keeps their cookie.
 */
export async function resetLocaleOnSignIn(userId: string): Promise<void> {
  try {
    const jar = await cookies();
    const owner = jar.get(LOCALE_OWNER_COOKIE)?.value ?? null;
    if (!shouldResetLocaleCookiesOnSignIn({ cookieOwner: owner, userId })) return;
    jar.delete({ name: LOCALE_COOKIE, path: "/" });
    jar.delete({ name: LOCALE_AUTO_COOKIE, path: "/" });
    jar.set(LOCALE_OWNER_COOKIE, userId, { ...localeCookieOptions, httpOnly: true });
  } catch {
    // Cookie writes are best effort here; the talent layout re-reconciles.
  }
}
