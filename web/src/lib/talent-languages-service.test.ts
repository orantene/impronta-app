import test from "node:test";
import assert from "node:assert/strict";

import { languageLevelRank } from "@/lib/talent-languages-service";

test("languageLevelRank: monotonic 1..5 across the level scale", () => {
  assert.equal(languageLevelRank("basic"), 1);
  assert.equal(languageLevelRank("conversational"), 2);
  assert.equal(languageLevelRank("professional"), 3);
  assert.equal(languageLevelRank("fluent"), 4);
  assert.equal(languageLevelRank("native"), 5);
});

test("languageLevelRank: null and undefined return 0 (excluded by minimum filters)", () => {
  assert.equal(languageLevelRank(null), 0);
  assert.equal(languageLevelRank(undefined), 0);
});

test("languageLevelRank ordering is suitable for >= filters", () => {
  // Check that >= professional excludes basic+conversational and includes pro+
  const minimum = languageLevelRank("professional");
  assert.ok(languageLevelRank("basic") < minimum);
  assert.ok(languageLevelRank("conversational") < minimum);
  assert.ok(languageLevelRank("professional") >= minimum);
  assert.ok(languageLevelRank("fluent") >= minimum);
  assert.ok(languageLevelRank("native") >= minimum);
});
