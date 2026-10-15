import { test } from "node:test";
import assert from "node:assert/strict";

import { ERROR_COPY_KEY, failFrom, newErrorRef, reasonFromDbError, type PromoActionError } from "./fail-from";
import { PROMO_COPY_EN, PROMO_COPY_ES } from "./copy/talent";

test("failFrom maps database errors to typed reasons", () => {
  assert.equal(reasonFromDbError({ code: "23505" }), "code_taken");
  assert.equal(reasonFromDbError({ code: "23514" }), "invalid");
  assert.equal(reasonFromDbError({ code: "P0001", message: "promos_hub_tenant_blocked" }), "not_available_yet");
  assert.equal(reasonFromDbError({ message: "ERROR: promos_hub_owner required" }), "not_available_yet");
  assert.equal(reasonFromDbError({ code: "08006", message: "connection failure" }), "unavailable");
  assert.equal(reasonFromDbError(null), "unavailable");
  assert.equal(reasonFromDbError({}), "unavailable");
});

test("only unavailable carries the support ref", () => {
  assert.deepEqual(failFrom({ code: "23505" }, "abcd1234"), { ok: false, error: "code_taken" });
  assert.deepEqual(failFrom({ code: "XX000" }, "abcd1234"), { ok: false, error: "unavailable", ref: "abcd1234" });
  assert.deepEqual(failFrom({ code: "XX000" }), { ok: false, error: "unavailable" });
});

test("newErrorRef is 8 url-safe chars and varies", () => {
  const a = newErrorRef();
  assert.match(a, /^[0-9a-f]{8}$/);
  assert.notEqual(a, newErrorRef());
});

test("every reason maps to its own copy key that exists in ES and EN", () => {
  const reasons = Object.keys(ERROR_COPY_KEY) as PromoActionError[];
  const keys = reasons.map((r) => ERROR_COPY_KEY[r]);
  assert.equal(new Set(keys).size, reasons.length, "keys are distinct");
  for (const k of keys) {
    assert.ok(k in PROMO_COPY_ES && k in PROMO_COPY_EN, k);
  }
  assert.ok("err.ref" in PROMO_COPY_ES && "err.ref" in PROMO_COPY_EN);
});
