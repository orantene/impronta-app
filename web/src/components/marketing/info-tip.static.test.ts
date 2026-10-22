import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

describe("TUL-1890: InfoTip tap target", () => {
  const src = readFileSync("src/components/marketing/info-tip.tsx", "utf8");
  it("keeps the 20 px visual icon", () => {
    assert.match(src, /\bh-5 w-5\b/);
  });
  it("the button itself is a real 44 px box with negative margin, not a ::before", () => {
    assert.match(src, /<button[\s\S]*?-m-3[\s\S]*?\bmin-h-11\b[\s\S]*?\bmin-w-11\b/);
    assert.doesNotMatch(src, /before:/);
  });
});
