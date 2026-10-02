import assert from "node:assert/strict";
import { test } from "node:test";

import { payLinkTarget } from "./pay-link-target";

test("uses the server-resolved absolute pay URL when there is one", () => {
  assert.equal(payLinkTarget("abc", "https://pay.tulala.digital/link/abc"), "https://pay.tulala.digital/link/abc");
});

test("falls back to the relative /pay path when nothing was resolved", () => {
  assert.equal(payLinkTarget("abc", null), "/pay/abc");
  assert.equal(payLinkTarget("a b", ""), "/pay/a%20b");
});

test("never navigates to a non-http resolved value", () => {
  assert.equal(payLinkTarget("abc", "javascript:alert(1)"), "/pay/abc");
});
