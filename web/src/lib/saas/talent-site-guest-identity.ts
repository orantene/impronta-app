import type { NextRequest, NextResponse } from "next/server";
import {
  GUEST_COOKIE_NAME,
  GUEST_COOKIE_OPTIONS,
  GUEST_HEADER_NAME,
  peekGuestIdentity,
  resolveGuestIdentity,
} from "@/lib/guest-cookie";

/**
 * A `talent_site` host's rewrite in proxy.ts returns before `updateSession`
 * (the only other place a guest identity is resolved) ever runs — see
 * `resolveGuestIdentity`'s doc comment. D-MSG-422: without this, no guest
 * server action on ANY talent vanity host ever received `x-impronta-guest`,
 * so every one refused as `forbidden` and no guest could message a talent.
 *
 * TUL-445: anonymous GETs must NOT mint/Set-Cookie `impronta_guest` — that
 * forces CDN `no-store` on every first visit. Peek the existing cookie and
 * forward the header when present; mint only when `mint` is true (non-GET
 * / server-action paths that still go through this helper) or when a guest
 * write action calls `ensureGuestIdentity`.
 *
 * Mutates `talentHeaders` in place (consistent with the other `.set()` calls
 * at the proxy.ts call site) and returns a function to attach the resulting
 * Set-Cookie to whichever `NextResponse` the branch builds.
 */
export function attachTalentSiteGuestIdentity(
  request: NextRequest,
  talentHeaders: Headers,
  options: { mint?: boolean } = {},
): (res: NextResponse) => NextResponse {
  const raw = request.cookies.get(GUEST_COOKIE_NAME)?.value;
  const method = request.method.toUpperCase();
  const isSafeRead = method === "GET" || method === "HEAD";
  const mint = options.mint ?? !isSafeRead;

  if (!mint) {
    const peeked = peekGuestIdentity(raw);
    if (peeked) {
      talentHeaders.set(GUEST_HEADER_NAME, peeked.guestKey);
    } else {
      talentHeaders.delete(GUEST_HEADER_NAME);
    }
    return (res) => res;
  }

  const identity = resolveGuestIdentity(raw);
  talentHeaders.set(GUEST_HEADER_NAME, identity.guestKey);
  return (res) => {
    if (identity.needsGuestCookie) {
      res.cookies.set(GUEST_COOKIE_NAME, identity.signedGuestCookie, GUEST_COOKIE_OPTIONS);
    }
    return res;
  };
}
