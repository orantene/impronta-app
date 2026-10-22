import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

describe("TUL-1890: InfoTip tap target", () => {
  const src = readFileSync("src/components/marketing/info-tip.tsx", "utf8");
  it("keeps the 20 px visual icon", () => {
    assert.match(src, /\bh-5 w-5\b/);
  });
  it("grows the hit area to 44 px with an invisible ::before (20 + 2 x 12)", () => {
    assert.match(src, /\brelative\b/);
    assert.match(src, /before:absolute/);
    assert.match(src, /before:-inset-3\b/);
  });
});
