import assert from "node:assert/strict";
import { test } from "node:test";
import { signBookingManageToken, verifyBookingManageToken } from "./manage-token";

test("a signed manage token verifies and an expired or garbled one does not", () => {
  const prev = process.env.GUEST_COOKIE_SECRET;
  process.env.GUEST_COOKIE_SECRET = "test-guest-cookie-secret-for-manage";
  try {
    const now = Date.parse("2026-10-01T00:00:00.000Z");
    const token = signBookingManageToken({
      bookingId: "b1",
      tenantId: "t1",
      action: "cancel",
      ttlSeconds: 60,
      nowMs: now,
    });
    assert.ok(token);
    const ok = verifyBookingManageToken(token!, now + 1_000);
    assert.equal(ok.ok, true);
    if (ok.ok) {
      assert.equal(ok.payload.bookingId, "b1");
      assert.equal(ok.payload.action, "cancel");
    }
    const expired = verifyBookingManageToken(token!, now + 120_000);
    assert.equal(expired.ok, false);
    if (!expired.ok) assert.equal(expired.reason, "token_invalid");
    assert.equal(verifyBookingManageToken("not-a-token").ok, false);
  } finally {
    if (prev === undefined) delete process.env.GUEST_COOKIE_SECRET;
    else process.env.GUEST_COOKIE_SECRET = prev;
  }
});
