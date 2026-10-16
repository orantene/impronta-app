import "server-only";

import { cookies } from "next/headers";

import {
  GUEST_COOKIE_NAME,
  GUEST_COOKIE_OPTIONS,
  resolveGuestIdentity,
} from "@/lib/guest-cookie";

/**
 * Mint (or keep) the HMAC-signed `impronta_guest` cookie for a guest write
 * action (chat open / booking start). TUL-445: page views no longer mint in
 * the proxy; the first action that needs a stable id calls this.
 *
 * Always goes through `resolveGuestIdentity` — the single mint source.
 * Never reads the guest request header: it is middleware-forwarded and
 * client-forgeable if left on the wire; only the verified cookie is trusted.
 */
export async function ensureGuestIdentity(): Promise<string> {
  const cookieStore = await cookies();
  const raw = cookieStore.get(GUEST_COOKIE_NAME)?.value;
  const identity = resolveGuestIdentity(raw);
  if (identity.needsGuestCookie) {
    cookieStore.set(GUEST_COOKIE_NAME, identity.signedGuestCookie, GUEST_COOKIE_OPTIONS);
  }
  return identity.guestKey;
}
