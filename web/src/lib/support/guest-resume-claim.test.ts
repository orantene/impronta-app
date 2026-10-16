/** TUL-618: first-use binding + 48h TTL for guest resume tokens. Lane: test:ai-guardrails. */
import test from "node:test";
import assert from "node:assert/strict";

import {
  GUEST_RESUME_TOKEN_MAX_AGE_MS,
  evaluateResumeClaim,
  signGuestResumeToken,
  verifyGuestResumeToken,
} from "./guest-resume-token";

process.env.GUEST_COOKIE_SECRET = "test-secret-for-resume";

test("token expires after 48h, valid before", () => {
  const t = signGuestResumeToken("tid", 1_000)!;
  assert.equal(GUEST_RESUME_TOKEN_MAX_AGE_MS, 48 * 3600 * 1000);
  assert.equal(verifyGuestResumeToken(t, 1_000 + GUEST_RESUME_TOKEN_MAX_AGE_MS - 1).ok, true);
  const late = verifyGuestResumeToken(t, 1_000 + GUEST_RESUME_TOKEN_MAX_AGE_MS + 1);
  assert.deepEqual(late.ok ? null : late.reason, "expired");
});

test("first session claims, same session may reuse, another session is refused", () => {
  const first = evaluateResumeClaim(undefined, 111, "sessA");
  assert.equal(first.allow, true);
  assert.equal(evaluateResumeClaim(first.claims, 111, "sessA").allow, true);
  assert.equal(evaluateResumeClaim(first.claims, 111, "sessB").allow, false);
});

test("a newer token (different iat) is claimable independently", () => {
  const a = evaluateResumeClaim(undefined, 111, "sessA");
  const b = evaluateResumeClaim(a.claims, 222, "sessB");
  assert.equal(b.allow, true);
  assert.equal(evaluateResumeClaim(b.claims, 111, "sessB").allow, false);
});

test("garbage stored claims are ignored and the map stays bounded", () => {
  assert.equal(evaluateResumeClaim("junk", 1, "s").allow, true);
  let claims = {};
  for (let i = 1; i <= 30; i++) claims = evaluateResumeClaim(claims, i, "s").claims;
  assert.ok(Object.keys(claims).length <= 20);
});
