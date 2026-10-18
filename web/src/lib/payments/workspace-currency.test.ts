import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { pickWorkspaceCurrency } from "./workspace-currency";

test("TUL-734: the agency preferred currency wins, then the first offering, then USD", () => {
  assert.equal(pickWorkspaceCurrency("mxn", "USD"), "MXN");
  assert.equal(pickWorkspaceCurrency(null, "mxn"), "MXN");
  assert.equal(pickWorkspaceCurrency("", " eur "), "EUR");
  assert.equal(pickWorkspaceCurrency(undefined, undefined), "USD");
  assert.equal(pickWorkspaceCurrency("pesos", "12"), "USD");
});

test("TUL-734: the Payments board empty state uses the workspace currency, not a hard-coded USD", () => {
  const src = readFileSync("src/app/(workspace)/[tenantSlug]/_data-bridge/payments-board.ts", "utf8");
  assert.match(src, /pickWorkspaceCurrency\(/);
  assert.doesNotMatch(src, /byMethod\[0\]\?\.currency \?\? "USD"/);
});
