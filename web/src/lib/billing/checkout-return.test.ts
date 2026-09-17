import { afterEach, beforeEach, describe, test } from "node:test";
import assert from "node:assert/strict";

import { idempotencySuffix, signCheckoutReturn, verifyCheckoutReturn } from "./checkout-return";

describe("signed checkout return", () => {
  let saved: string | undefined;
  beforeEach(() => {
    saved = process.env.GUEST_COOKIE_SECRET;
    process.env.GUEST_COOKIE_SECRET = "test-secret-for-checkout-return";
  });
  afterEach(() => {
    if (saved === undefined) delete process.env.GUEST_COOKIE_SECRET;
    else process.env.GUEST_COOKIE_SECRET = saved;
  });

  test("round-trips for the same subject", () => {
    const token = signCheckoutReturn({ subjectId: "t1", path: "/slug/admin/settings?tab=domain", nowMs: 1000 });
    assert.ok(token);
    const back = verifyCheckoutReturn(token, "t1", 2000);
    assert.deepEqual(back, { ok: true, path: "/slug/admin/settings?tab=domain" });
  });

  test("refuses another subject, expiry, tampering and unsafe paths", () => {
    const token = signCheckoutReturn({ subjectId: "t1", path: "/slug/admin", nowMs: 1000 })!;
    assert.deepEqual(verifyCheckoutReturn(token, "t2", 2000), { ok: false });
    assert.deepEqual(verifyCheckoutReturn(token, "t1", 1000 + 3 * 3600 * 1000), { ok: false });
    assert.deepEqual(verifyCheckoutReturn(token.slice(0, -2) + "zz", "t1", 2000), { ok: false });
    assert.deepEqual(verifyCheckoutReturn("nodot", "t1", 2000), { ok: false });
    assert.deepEqual(verifyCheckoutReturn(undefined, "t1", 2000), { ok: false });
    assert.equal(signCheckoutReturn({ subjectId: "t1", path: "//evil.com" }), null);
    assert.equal(signCheckoutReturn({ subjectId: "", path: "/x" }), null);
  });

  test("without the secret nothing signs or verifies", () => {
    delete process.env.GUEST_COOKIE_SECRET;
    assert.equal(signCheckoutReturn({ subjectId: "t1", path: "/x" }), null);
    assert.deepEqual(verifyCheckoutReturn("a.b", "t1"), { ok: false });
  });

  test("idempotency suffix is empty without a token and stable with one", () => {
    assert.equal(idempotencySuffix(null), "");
    assert.equal(idempotencySuffix(""), "");
    const s = idempotencySuffix("abc.def");
    assert.match(s, /^_r[0-9a-f]{10}$/);
    assert.equal(s, idempotencySuffix("abc.def"));
    assert.notEqual(s, idempotencySuffix("abc.deg"));
  });
});
