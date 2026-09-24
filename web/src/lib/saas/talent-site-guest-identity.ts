import type { NextRequest, NextResponse } from "next/server";
import {
  GUEST_COOKIE_NAME,
  GUEST_COOKIE_OPTIONS,
  GUEST_HEADER_NAME,
  resolveGuestIdentity,
} from "@/lib/guest-cookie";

/**
 * A `talent_site` host's rewrite in proxy.ts returns before `updateSession`
 * (the only other place a guest identity is resolved) ever runs — see
 * `resolveGuestIdentity`'s doc comment. D-MSG-422: without this, no guest
 * server action on ANY talent vanity host ever received `x-impronta-guest`,
 * so every one refused as `forbidden` and no guest could message a talent.
 *
 * Mutates `talentHeaders` in place (consistent with the other `.set()` calls
 * at the proxy.ts call site) and returns a function to attach the resulting
 * Set-Cookie to whichever `NextResponse` the branch builds.
 */
export function attachTalentSiteGuestIdentity(
  request: NextRequest,
  talentHeaders: Headers,
): (res: NextResponse) => NextResponse {
  const identity = resolveGuestIdentity(request.cookies.get(GUEST_COOKIE_NAME)?.value);
  talentHeaders.set(GUEST_HEADER_NAME, identity.guestKey);
  return (res) => {
    if (identity.needsGuestCookie) {
      res.cookies.set(GUEST_COOKIE_NAME, identity.signedGuestCookie, GUEST_COOKIE_OPTIONS);
    }
    return res;
  };
}
