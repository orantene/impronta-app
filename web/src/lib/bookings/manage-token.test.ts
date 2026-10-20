import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { test } from "node:test";
import { LEGACY_COOKIE_SECRET_GRACE_UNTIL_MS, signBookingManageToken, verifyBookingManageToken } from "./manage-token";

function withEnv(env: Record<string, string | undefined>, run: () => void) {
  const prev: Record<string, string | undefined> = {};
  for (const k of Object.keys(env)) {
    prev[k] = process.env[k];
    if (env[k] === undefined) delete process.env[k];
    else process.env[k] = env[k];
  }
  try {
    run();
  } finally {
    for (const k of Object.keys(env)) {
      if (prev[k] === undefined) delete process.env[k];
      else process.env[k] = prev[k];
    }
  }
}

const NEW = "test-booking-manage-secret";
const COOKIE = "test-guest-cookie-secret-for-manage";
const base = { bookingId: "b1", tenantId: "t1", action: "cancel" as const };

/** A token signed the way links were before TUL-1550: with the guest cookie secret. */
function legacyToken(nowMs: number): string {
  const body = Buffer.from(JSON.stringify({ ...base, exp: nowMs + 60_000 }), "utf8").toString("base64url");
  return `${body}.${createHmac("sha256", COOKIE).update(body).digest("base64url")}`;
}

test("a signed manage token verifies and an expired or garbled one does not", () => {
  withEnv({ BOOKING_MANAGE_TOKEN_SECRET: NEW, GUEST_COOKIE_SECRET: COOKIE }, () => {
    const now = Date.parse("2026-10-01T00:00:00.000Z");
    const token = signBookingManageToken({ ...base, ttlSeconds: 60, nowMs: now });
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
  });
});

test("signing never uses the guest cookie secret: without the dedicated secret nothing is signed", () => {
  withEnv({ BOOKING_MANAGE_TOKEN_SECRET: undefined, GUEST_COOKIE_SECRET: COOKIE }, () => {
    assert.equal(signBookingManageToken({ ...base }), null);
  });
});

test("a token signed with the cookie secret verifies only inside the grace window", () => {
  withEnv({ BOOKING_MANAGE_TOKEN_SECRET: NEW, GUEST_COOKIE_SECRET: COOKIE }, () => {
    const during = LEGACY_COOKIE_SECRET_GRACE_UNTIL_MS - 3 * 24 * 3600 * 1000;
    assert.equal(verifyBookingManageToken(legacyToken(during), during + 1_000).ok, true);
    const after = LEGACY_COOKIE_SECRET_GRACE_UNTIL_MS + 1_000;
    assert.equal(verifyBookingManageToken(legacyToken(after), after + 1_000).ok, false);
  });
});

test("a token signed with the new secret never verifies under the cookie secret alone", () => {
  const now = LEGACY_COOKIE_SECRET_GRACE_UNTIL_MS + 1_000;
  let token: string | null = null;
  withEnv({ BOOKING_MANAGE_TOKEN_SECRET: NEW, GUEST_COOKIE_SECRET: COOKIE }, () => {
    token = signBookingManageToken({ ...base, ttlSeconds: 60, nowMs: now });
  });
  withEnv({ BOOKING_MANAGE_TOKEN_SECRET: undefined, GUEST_COOKIE_SECRET: NEW }, () => {
    assert.equal(verifyBookingManageToken(token!, now + 1_000).ok, false);
  });
});
