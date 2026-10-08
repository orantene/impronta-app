import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

// ServicesHome rows must go through the wrapper that feeds the server-provided
// locales to the chip; a bare ItemStateChips there would silently drop the cue.
const home = readFileSync(new URL("./ServicesHome.tsx", import.meta.url), "utf8");
const wrapper = readFileSync(new URL("./ServicesHomeItemChips.tsx", import.meta.url), "utf8");

test("ServicesHome rows use ServicesHomeItemChips, not a bare ItemStateChips", () => {
  assert.match(home, /<ServicesHomeItemChips\s/);
  assert.doesNotMatch(home, /<ItemStateChips\s/);
});

test("the wrapper reads the server talentLocales first and passes primary + locales", () => {
  assert.match(wrapper, /useAdminShell\(\)/);
  assert.match(wrapper, /listLocales\(talentLocales, store\)/);
  assert.match(wrapper, /primary=\{primary\} locales=\{locales\}/);
});
