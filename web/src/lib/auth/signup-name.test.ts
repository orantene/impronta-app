import assert from "node:assert/strict";
import { test } from "node:test";

import { sanitizeSignupName, signupNameMetadata, SIGNUP_NAME_MAX } from "./signup-name";

test("TUL-762: the sign-up name is trimmed, single-spaced and capped", () => {
  assert.equal(sanitizeSignupName("  Ana   María \n López "), "Ana María López");
  assert.equal(sanitizeSignupName("x".repeat(500)).length, SIGNUP_NAME_MAX);
  assert.equal(sanitizeSignupName(undefined), "");
  assert.equal(sanitizeSignupName(42), "");
});

test("TUL-762: the name rides as full_name metadata only when present", () => {
  assert.deepEqual(signupNameMetadata("Ana"), { full_name: "Ana" });
  assert.equal(signupNameMetadata("   "), undefined);
});

test("TUL-762: control characters and tabs collapse to single spaces, unicode names survive intact", () => {
  assert.equal(sanitizeSignupName("Ana\t\u0000\u0007María\r\nLópez\u007f"), "Ana María López");
  assert.equal(sanitizeSignupName("  José   Ñandú  "), "José Ñandú");
  assert.equal(sanitizeSignupName("李 小龍"), "李 小龍");
  assert.equal(sanitizeSignupName("Ana\u00a0\u00a0 López"), "Ana López", "non-breaking and wide spaces collapse too");
  assert.equal(sanitizeSignupName("   \n\t "), "");
  assert.equal(sanitizeSignupName(null), "");
  assert.equal(sanitizeSignupName({ toString: () => "Ana" }), "", "only real strings are accepted");
});

test("TUL-762: the cap is applied after cleaning and metadata carries the cleaned value", () => {
  // leading/inner whitespace never eats into the budget
  const out = sanitizeSignupName(`   ${"a".repeat(SIGNUP_NAME_MAX)}`);
  assert.equal(out, "a".repeat(SIGNUP_NAME_MAX));
  assert.deepEqual(signupNameMetadata("  Ana   López "), { full_name: "Ana López" });
  assert.equal(signupNameMetadata(undefined), undefined);
});
