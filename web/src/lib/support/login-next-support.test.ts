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
