import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// TUL-986: the 390px talent "More" sheet carries Plan and the desktop rail's labels.
const src = readFileSync("src/components/talent/studio/MoreScreen.tsx", "utf8");

test("More sheet has a Plan row that opens the tier-compare drawer", () => {
  assert.match(src, /label: "Plan"/);
  assert.match(src, /openDrawer\("talent-tier-compare"\)/);
});

test("More sheet uses the desktop labels", () => {
  assert.match(src, /label: "My presence"/);
  assert.match(src, /label: "Profile"/);
  assert.doesNotMatch(src, /"My public page"|"Edit my profile"/);
});
