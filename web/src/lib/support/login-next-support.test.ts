import assert from "node:assert/strict";
import { test } from "node:test";

import { loginUrlKeepingSupport } from "./login-next-support";

const h = (search: string | null) => ({
  get: (n: string) => (n === "x-impronta-original-search" ? search : null),
});

test("keeps ?support= through the login redirect", () => {
  assert.equal(
    loginUrlKeepingSupport("/talent/today", h("?support=abc-123")),
    "/login?next=%2Ftalent%2Ftoday%3Fsupport%3Dabc-123",
  );
});

test("no support param keeps the legacy URL", () => {
  assert.equal(loginUrlKeepingSupport("/talent/today", h("")), "/login?next=/talent/today");
  assert.equal(loginUrlKeepingSupport("/talent/today", h(null)), "/login?next=/talent/today");
});

test("rejects a support value that is not a plain id", () => {
  assert.equal(
    loginUrlKeepingSupport("/admin", h("?support=%2F%2Fevil.com")),
    "/login?next=/admin",
  );
});

import { nextPathKeepingSupport } from "./login-next-support";

test("middleware next= keeps ?support= on dashboard paths only", () => {
  assert.equal(nextPathKeepingSupport("/talent", "?support=abc-123"), "/talent?support=abc-123");
  assert.equal(nextPathKeepingSupport("/talent/today", "?support=abc_1&x=1"), "/talent/today?support=abc_1");
  assert.equal(nextPathKeepingSupport("/acme/client", "?support=9"), "/acme/client?support=9");
  assert.equal(nextPathKeepingSupport("/talent", ""), "/talent");
  assert.equal(nextPathKeepingSupport("/talent", "?support=%2F%2Fevil.com"), "/talent");
  assert.equal(nextPathKeepingSupport("/pricing", "?support=abc"), "/pricing");
  assert.equal(nextPathKeepingSupport("/talent?x=1", "?support=abc"), "/talent?x=1");
});
