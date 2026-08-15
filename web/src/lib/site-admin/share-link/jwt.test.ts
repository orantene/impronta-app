/**
 * jwt.test.ts — the share token's payload round-trip, with the PAGE IDENTITY
 * as the load-bearing claim.
 *
 * BACKGROUND: the token format always carried `pid` (page id) and `rev`
 * (revision id) — the bug was upstream, in `share-actions.ts`, which resolved
 * the homepage row no matter which page the operator was editing, so `pid` was
 * always the homepage's id. The fix is page-scoped resolution, and NO token
 * format change was needed. These tests pin that contract so the format cannot
 * drift out from under it: whatever page id is signed must be the page id the
 * public `/share/<token>` route reads back, because that claim is the only
 * thing telling the route which page's draft to render.
 *
 * Test runner: node:test + node:assert/strict
 */

import assert from "node:assert/strict";
import { test } from "node:test";

// Both sign and verify read this at call time, so setting it here is enough.
process.env.PREVIEW_JWT_SECRET =
  process.env.PREVIEW_JWT_SECRET ??
  "test-preview-jwt-secret-value-at-least-32-chars";

import {
  signShareJwt,
  verifyShareJwt,
  SHARE_JWT_DEFAULT_TTL_SECONDS,
  SHARE_JWT_MAX_TTL_SECONDS,
  SHARE_JWT_MIN_TTL_SECONDS,
} from "./jwt";

const BASE = {
  tenantId: "11111111-1111-4111-8111-111111111111",
  pageId: "22222222-2222-4222-8222-222222222222",
  revisionId: "33333333-3333-4333-8333-333333333333",
  issuerProfileId: "44444444-4444-4444-8444-444444444444",
};

test("a token round-trips every claim, page identity included", () => {
  const signed = signShareJwt({
    ...BASE,
    label: "Client review",
    comment: "rw",
  });
  const verified = verifyShareJwt(signed.token);
  assert.equal(verified.ok, true);
  if (!verified.ok) return;
  assert.equal(verified.claims.tenantId, BASE.tenantId);
  assert.equal(verified.claims.pageId, BASE.pageId);
  assert.equal(verified.claims.revisionId, BASE.revisionId);
  assert.equal(verified.claims.issuerProfileId, BASE.issuerProfileId);
  assert.equal(verified.claims.label, "Client review");
  assert.equal(verified.claims.comment, "rw");
});

test("two tokens for two different pages stay distinguishable", () => {
  // The whole point of the fix: a link minted while editing an inner page must
  // resolve THAT page, not the homepage. The route routes on `pid`, so the two
  // tokens must not collapse into each other.
  const homepage = signShareJwt({ ...BASE, pageId: "home-page-id" });
  const inner = signShareJwt({ ...BASE, pageId: "about-page-id" });
  const a = verifyShareJwt(homepage.token);
  const b = verifyShareJwt(inner.token);
  assert.equal(a.ok && a.claims.pageId, "home-page-id");
  assert.equal(b.ok && b.claims.pageId, "about-page-id");
});

test("the revision id is baked in at mint time so a sent link cannot drift", () => {
  const signed = signShareJwt({ ...BASE, revisionId: "rev-at-mint" });
  const verified = verifyShareJwt(signed.token);
  assert.equal(verified.ok && verified.claims.revisionId, "rev-at-mint");
});

test("comment permission defaults to none when the claim is absent", () => {
  const signed = signShareJwt(BASE);
  const verified = verifyShareJwt(signed.token);
  assert.equal(verified.ok && verified.claims.comment, "none");
});

test("TTL is clamped into the [1h, 30d] band and reflected in expiresAt", () => {
  const tooShort = signShareJwt(BASE, 5);
  const tooLong = signShareJwt(BASE, SHARE_JWT_MAX_TTL_SECONDS * 10);
  const now = Date.now();
  const shortTtl = Math.round((tooShort.expiresAt.getTime() - now) / 1000);
  const longTtl = Math.round((tooLong.expiresAt.getTime() - now) / 1000);
  assert.ok(Math.abs(shortTtl - SHARE_JWT_MIN_TTL_SECONDS) <= 2);
  assert.ok(Math.abs(longTtl - SHARE_JWT_MAX_TTL_SECONDS) <= 2);
  const dflt = signShareJwt(BASE);
  assert.ok(
    Math.abs(
      Math.round((dflt.expiresAt.getTime() - now) / 1000) -
        SHARE_JWT_DEFAULT_TTL_SECONDS,
    ) <= 2,
  );
});

test("a tampered payload is rejected rather than resolving a different page", () => {
  const signed = signShareJwt(BASE);
  const [header, body, sig] = signed.token.split(".");
  const decoded = JSON.parse(
    Buffer.from(
      body + "==".slice((body.length + 2) % 4),
      "base64url",
    ).toString("utf8"),
  );
  decoded.pid = "someone-elses-page";
  const forgedBody = Buffer.from(JSON.stringify(decoded), "utf8")
    .toString("base64url")
    .replace(/=+$/g, "");
  const verified = verifyShareJwt(`${header}.${forgedBody}.${sig}`);
  assert.equal(verified.ok, false);
  assert.equal(verified.ok === false && verified.reason, "bad_signature");
});

test("a malformed token is rejected", () => {
  assert.equal(verifyShareJwt("not-a-token").ok, false);
  assert.equal(verifyShareJwt("a.b").ok, false);
});
