import type { NextRequest, NextResponse } from "next/server";
import {
  GUEST_COOKIE_NAME,
  GUEST_HEADER_NAME,
  peekGuestIdentity,
} from "@/lib/guest-cookie";

/**
 * A `talent_site` host's rewrite in proxy.ts returns before `updateSession`
 * (the only other place a guest identity is resolved) ever runs — see
 * `resolveGuestIdentity`'s doc comment. D-MSG-422: without this, no guest
 * server action on ANY talent vanity host ever received `x-impronta-guest`,
 * so every one refused as `forbidden` and no guest could message a talent.
 *
 * TUL-445: this helper is peek-only. Anonymous GETs must NOT mint/Set-Cookie
 * `impronta_guest` (CDN `no-store`). Non-GET paths also do not mint here —
 * write actions call `ensureGuestIdentity` (cookie-only; never trusts the
 * header). We only forward a header when the inbound cookie verifies.
 *
 * Mutates `talentHeaders` in place (consistent with the other `.set()` calls
 * at the proxy.ts call site) and returns a function to attach cookies to
 * whichever `NextResponse` the branch builds (no Set-Cookie from this helper).
 */
export function attachTalentSiteGuestIdentity(
  request: NextRequest,
  talentHeaders: Headers,
): (res: NextResponse) => NextResponse {
  const raw = request.cookies.get(GUEST_COOKIE_NAME)?.value;
  const peeked = peekGuestIdentity(raw);
  if (peeked) {
    talentHeaders.set(GUEST_HEADER_NAME, peeked.guestKey);
  } else {
    // Drop any client-forged inbound value (proxy also strips this header).
    talentHeaders.delete(GUEST_HEADER_NAME);
  }
  return (res) => res;
}
