import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/**
 * TUL-1890: every info (i) trigger needs a real 44 x 44 px box on the button
 * itself (QA measures the element box, so a ::before hit area does not count).
 */
const TRIGGERS: Array<[string, RegExp]> = [
  ["src/components/marketing/info-tip.tsx", /<button[\s\S]*?min-h-11[\s\S]*?min-w-11/],
  ["src/components/talent/service-hub/FeeNote.tsx", /<button[\s\S]*?min-h-11[\s\S]*?min-w-11/],
  ["src/components/ui/info-tip.tsx", /<button[\s\S]*?-m-4[\s\S]*?min-h-11[\s\S]*?min-w-11/],
  ["src/components/promos/talent/ui.tsx", /<button[\s\S]*?h-11 w-11/],
];

describe("TUL-1890: info triggers are real 44 px boxes", () => {
  for (const [file, re] of TRIGGERS) {
    it(file, () => {
      assert.match(readFileSync(file, "utf8"), re);
    });
  }
  it("ChannelPanels uses FeeNote, not a bare span glyph", () => {
    const src = readFileSync("src/components/talent/service-hub/ChannelPanels.tsx", "utf8");
    assert.doesNotMatch(src, /role="img"/);
    assert.match(src, /<FeeNote /);
  });
});
