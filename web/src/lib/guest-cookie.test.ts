// Pins resolveGuestIdentity as the ONE place a guest id is verified or
// minted (2026-09-24). A talent vanity host's rewrite in proxy.ts returns
// from middleware before updateSession ever runs, so it cannot call
// updateSession for a guest identity — it calls this directly instead. If
// this function ever drifted from what updateSession itself does, the two
// surfaces would mint incompatible guest ids and a guest could never hold a
// stable session across a second server action.
import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import {
  resolveGuestIdentity,
  signGuestCookie,
  verifyGuestCookie,
  GUEST_COOKIE_NAME,
  GUEST_HEADER_NAME,
} from "./guest-cookie";

const SECRET_ENV = "GUEST_COOKIE_SECRET";

describe("resolveGuestIdentity", () => {
  let previousSecret: string | undefined;

  beforeEach(() => {
    previousSecret = process.env[SECRET_ENV];
    process.env[SECRET_ENV] = "test-secret-for-guest-cookie-tests";
  });

  afterEach(() => {
    if (previousSecret === undefined) delete process.env[SECRET_ENV];
    else process.env[SECRET_ENV] = previousSecret;
  });

  it("mints a fresh id and asks to set the cookie when none is present", () => {
    const identity = resolveGuestIdentity(undefined);
    assert.ok(identity.guestKey.length > 0);
    assert.equal(identity.needsGuestCookie, true);
    assert.equal(verifyGuestCookie(identity.signedGuestCookie), identity.guestKey);
  });

  it("re-mints when the inbound cookie is forged", () => {
    const identity = resolveGuestIdentity("attacker-supplied-id.bad-signature");
    assert.notEqual(identity.guestKey, "attacker-supplied-id");
    assert.equal(identity.needsGuestCookie, true);
  });

  it("keeps a validly-signed id and does NOT ask to re-set the cookie", () => {
    const signed = signGuestCookie("11111111-1111-4111-8111-111111111111");
    const identity = resolveGuestIdentity(signed);
    assert.equal(identity.guestKey, "11111111-1111-4111-8111-111111111111");
    assert.equal(identity.needsGuestCookie, false);
  });

  it("is what updateSession's own logic reduces to (parity, not divergence)", () => {
    // The inline logic updateSession used to run BEFORE this was extracted,
    // reproduced here so a change to resolveGuestIdentity that quietly
    // diverges from that contract fails this test, not a live guest.
    const rawGuestCookie = "some-other-id.wrong-sig";
    const verifiedGuestId = verifyGuestCookie(rawGuestCookie);
    const expectedNeedsCookie =
      verifiedGuestId === null ||
      rawGuestCookie !== signGuestCookie(verifiedGuestId ?? "");
    const identity = resolveGuestIdentity(rawGuestCookie);
    assert.equal(verifiedGuestId, null);
    assert.equal(identity.needsGuestCookie, expectedNeedsCookie);
  });

  it("REVERT-PROOF: fails if a caller stops sending the header the talent-site branch depends on", () => {
    // This does not call proxy.ts (which needs the full Next.js middleware
    // runtime to exercise) — it pins the two exported names a caller MUST
    // use together, so a rename of either constant fails at compile time
    // rather than shipping a talent host that sets the wrong header name.
    assert.equal(GUEST_COOKIE_NAME, "impronta_guest");
    assert.equal(GUEST_HEADER_NAME, "x-impronta-guest");
  });
});
