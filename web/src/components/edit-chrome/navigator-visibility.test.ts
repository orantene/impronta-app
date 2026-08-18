import assert from "node:assert/strict";
import { test } from "node:test";

import { nextSectionVisibility } from "./navigator-visibility";

test("navigator eye cycles all four visibility states", () => {
  assert.equal(nextSectionVisibility("always"), "desktop-only");
  assert.equal(nextSectionVisibility("desktop-only"), "mobile-only");
  assert.equal(nextSectionVisibility("mobile-only"), "hidden");
  assert.equal(nextSectionVisibility("hidden"), "always");
  assert.equal(nextSectionVisibility(undefined), "desktop-only");
});
