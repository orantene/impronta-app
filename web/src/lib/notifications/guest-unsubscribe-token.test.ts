import assert from "node:assert/strict";
import { test } from "node:test";

import {
  signGuestEmailUnsubscribeToken,
  verifyGuestEmailUnsubscribeToken,
} from "./guest-unsubscribe-token";

test("guest unsubscribe token signs and verifies an email when secret is set", () => {
  const prev = process.env.GUEST_COOKIE_SECRET;
  process.env.GUEST_COOKIE_SECRET = "test-guest-unsub-secret";
  try {
    const token = signGuestEmailUnsubscribeToken("Prospect@Example.com");
    assert.ok(token);
    const verified = verifyGuestEmailUnsubscribeToken(token!);
    assert.equal(verified.ok, true);
    if (verified.ok) assert.equal(verified.email, "prospect@example.com");
    assert.equal(verifyGuestEmailUnsubscribeToken("ge1.nope.nope").ok, false);
  } finally {
    if (prev === undefined) delete process.env.GUEST_COOKIE_SECRET;
    else process.env.GUEST_COOKIE_SECRET = prev;
  }
});

test("unsigned secret yields no token", () => {
  const prev = process.env.GUEST_COOKIE_SECRET;
  delete process.env.GUEST_COOKIE_SECRET;
  try {
    assert.equal(signGuestEmailUnsubscribeToken("a@b.com"), null);
  } finally {
    if (prev !== undefined) process.env.GUEST_COOKIE_SECRET = prev;
  }
});
