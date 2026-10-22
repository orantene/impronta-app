import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const src = readFileSync(join(__dirname, "site-live-verified.ts"), "utf8");

test("a failed live check logs as expected (warn), not as a server error", () => {
  assert.match(src, /logServerExpected\("talentSite\.liveVerified", new Error\(`check:/);
  assert.doesNotMatch(src, /logServerError\("talentSite\.liveVerified", new Error\(`check:/);
});

test("a talent without a name returns not-verified before any fetch", () => {
  const nameGuard = src.indexOf("if (!name) return null;");
  assert.ok(nameGuard > 0);
  assert.ok(nameGuard < src.indexOf("verifyLivePage({"));
});
