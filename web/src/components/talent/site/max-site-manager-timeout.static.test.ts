import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const src = readFileSync("src/components/talent/site/TalentMaxSiteManager.tsx", "utf8");

test("TUL-728: the site manager load times out into the retry state instead of loading forever", () => {
  assert.match(src, /MANAGER_LOAD_TIMEOUT_MS/);
  assert.match(src, /Promise\.race\(\[\s*takeOr\("manager"/);
});
