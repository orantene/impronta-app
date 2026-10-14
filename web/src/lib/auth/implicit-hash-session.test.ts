import { test } from "node:test";
import assert from "node:assert/strict";

import { parseImplicitAuthHash, safeSameOriginPath } from "./implicit-hash-session";

const ORIGIN = "https://staging.tulala.digital";

test("parses access + refresh tokens from the fragment", () => {
  const r = parseImplicitAuthHash("#access_token=a.b.c&refresh_token=r1&token_type=bearer&type=magiclink");
  assert.deepEqual(r, { kind: "session", accessToken: "a.b.c", refreshToken: "r1" });
});

test("access token without refresh token is ignored (setSession needs both)", () => {
  assert.equal(parseImplicitAuthHash("#access_token=a.b.c"), null);
});

test("error fragment is reported", () => {
  const r = parseImplicitAuthHash("#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid");
  assert.deepEqual(r, { kind: "error", code: "otp_expired" });
});

test("unrelated hashes are left alone", () => {
  assert.equal(parseImplicitAuthHash(""), null);
  assert.equal(parseImplicitAuthHash("#book"), null);
  assert.equal(parseImplicitAuthHash("#services"), null);
});

test("same-origin path guard", () => {
  assert.equal(safeSameOriginPath("/dashboard?x=1", ORIGIN, "/"), "/dashboard?x=1");
  assert.equal(safeSameOriginPath("//evil.com/x", ORIGIN, "/"), "/");
  assert.equal(safeSameOriginPath("/\\evil.com", ORIGIN, "/"), "/");
  assert.equal(safeSameOriginPath("https://evil.com/", ORIGIN, "/"), "/");
  assert.equal(safeSameOriginPath("javascript:alert(1)", ORIGIN, "/"), "/");
  assert.equal(safeSameOriginPath(null, ORIGIN, "/home"), "/home");
});
