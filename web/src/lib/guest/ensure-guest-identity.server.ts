import "server-only";

import { cookies, headers } from "next/headers";

import {
  GUEST_COOKIE_NAME,
  GUEST_COOKIE_OPTIONS,
  GUEST_HEADER_NAME,
  resolveGuestIdentity,
  signGuestCookie,
} from "@/lib/guest-cookie";

/**
 * Mint (or keep) the HMAC-signed `impronta_guest` cookie for a guest write
 * action (chat open / booking start). TUL-445: page views no longer mint in
 * the proxy; the first action that needs a stable id calls this.
 *
 * Always goes through `resolveGuestIdentity` — the single mint source.
 * Returns the plain guest key for this request (the proxy header may still be
 * absent on a fresh visitor until Set-Cookie lands on the response).
 */
export async function ensureGuestIdentity(): Promise<string> {
  const cookieStore = await cookies();
  const raw = cookieStore.get(GUEST_COOKIE_NAME)?.value;
  if (raw) {
    const identity = resolveGuestIdentity(raw);
    if (identity.needsGuestCookie) {
      cookieStore.set(GUEST_COOKIE_NAME, identity.signedGuestCookie, GUEST_COOKIE_OPTIONS);
    }
    return identity.guestKey;
  }

  // Returning guest whose proxy peek already forwarded the plain id on this
  // request (cookie present upstream but not visible here is rare). Re-sign
  // that known id so we do not mint a second session key.
  const fromHeader = (await headers()).get(GUEST_HEADER_NAME)?.trim();
  if (fromHeader) {
    const identity = resolveGuestIdentity(signGuestCookie(fromHeader));
    if (identity.needsGuestCookie) {
      cookieStore.set(GUEST_COOKIE_NAME, identity.signedGuestCookie, GUEST_COOKIE_OPTIONS);
    }
    return identity.guestKey;
  }

  const identity = resolveGuestIdentity(undefined);
  cookieStore.set(GUEST_COOKIE_NAME, identity.signedGuestCookie, GUEST_COOKIE_OPTIONS);
  return identity.guestKey;
}
