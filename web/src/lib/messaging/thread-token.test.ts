import assert from "node:assert/strict";
import { test } from "node:test";

import { issueVisitorCode, signThreadToken, verifyThreadToken } from "./thread-token";

test("round-trip token when secret is set", () => {
  const prev = process.env.GUEST_COOKIE_SECRET;
  process.env.GUEST_COOKIE_SECRET = "test-secret-for-pos-messages";
  const token = signThreadToken("11111111-1111-4111-8111-111111111111", "22222222-2222-4222-8222-222222222222", 1_000);
  assert.ok(token);
  const verified = verifyThreadToken(token ?? "", 1_000);
  assert.equal(verified.ok, true);
  if (verified.ok) {
    assert.equal(verified.inquiryId, "11111111-1111-4111-8111-111111111111");
  }
  process.env.GUEST_COOKIE_SECRET = prev;
});

test("visitor continuation code is six digits", () => {
  const code = issueVisitorCode();
  assert.match(code, /^[0-9]{6}$/);
});
