import "server-only";

import { cookies } from "next/headers";

import { GUEST_COOKIE_EXPIRY_OPTIONS, GUEST_COOKIE_NAME } from "@/lib/guest-cookie";

/**
 * Expire the guest-session cookie from a server action (TUL-401). Call on
 * sign-out so the next visitor on this browser gets a fresh guest id instead of
 * resuming the previous person's thread. Best effort: a read-only cookie
 * context must never block the sign-out itself.
 */
export async function clearGuestCookie(): Promise<void> {
  try {
    const jar = await cookies();
    jar.set(GUEST_COOKIE_NAME, "", GUEST_COOKIE_EXPIRY_OPTIONS);
  } catch {
    // Cookie jar not writable here; the proxy re-mints on the next request.
  }
}
