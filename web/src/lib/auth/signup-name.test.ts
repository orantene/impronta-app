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
