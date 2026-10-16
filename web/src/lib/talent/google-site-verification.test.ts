import assert from "node:assert/strict";
import test from "node:test";

import { parseGoogleSiteVerificationInput, sanitizeStoredVerificationToken } from "./google-site-verification";

const TOKEN = "abcDEF123_-xyzABC456_-abcDEF123_-xyzABC456";

test("bare token is accepted and trimmed", () => {
  assert.deepEqual(parseGoogleSiteVerificationInput(`  ${TOKEN}\n`), { ok: true, token: TOKEN });
});

test("full meta tag yields the content token (double and single quotes)", () => {
  assert.deepEqual(
    parseGoogleSiteVerificationInput(`<meta name="google-site-verification" content="${TOKEN}" />`),
    { ok: true, token: TOKEN },
  );
  assert.deepEqual(
    parseGoogleSiteVerificationInput(`<meta name='google-site-verification' content='${TOKEN}'>`),
    { ok: true, token: TOKEN },
  );
});

test("empty input clears the token", () => {
  assert.deepEqual(parseGoogleSiteVerificationInput("   "), { ok: true, token: null });
});

test("unsafe or oversized input is rejected, not stripped", () => {
  for (const bad of [
    `"><script>alert(1)</script>`,
    `<meta name="x" content="a b">`,
    `<meta name="x" content="a&quot;b">`,
    "a".repeat(101),
    "<meta name=\"x\">",
    "tok en",
    42,
    null,
  ]) {
    assert.deepEqual(parseGoogleSiteVerificationInput(bad), { ok: false, error: "invalid_token" });
  }
  assert.equal(parseGoogleSiteVerificationInput("a".repeat(100)).ok, true);
});

test("stored values are re-validated on read", () => {
  assert.equal(sanitizeStoredVerificationToken(TOKEN), TOKEN);
  assert.equal(sanitizeStoredVerificationToken('x"y'), null);
  assert.equal(sanitizeStoredVerificationToken(null), null);
});
