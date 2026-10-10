import assert from "node:assert/strict";
import { test } from "node:test";

import { primaryNavAriaLabel } from "./primary-nav-label";

test("primaryNavAriaLabel localizes ES/EN (GRK-101)", () => {
  assert.equal(primaryNavAriaLabel("en"), "Primary");
  assert.equal(primaryNavAriaLabel("es"), "Principal");
  assert.equal(primaryNavAriaLabel("es-MX"), "Principal");
  assert.equal(primaryNavAriaLabel(undefined), "Primary");
});
