import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

// TUL-79 #12 (sweep a9277d1f7): at 1280 px the 'Tablet editing' panel (x 36-332)
// overlapped the centred tablet frame (x 223-1057). The tablet HUD now starts as
// its header only, with a Show/Hide toggle for the body; mobile editing is unchanged.
const src = readFileSync(join(process.cwd(), "src/components/edit-chrome/mobile-edit-panel.tsx"), "utf8");

test("the tablet HUD body starts hidden and is toggled by a header button", () => {
  assert.match(src, /const \[tabletBodyOpen, setTabletBodyOpen\] = useState\(false\);/);
  assert.match(src, /display: tabletHud && !tabletBodyOpen \? "none" : "flex"/);
  assert.match(src, /data-tablet-hud-toggle/);
  assert.match(src, /aria-expanded=\{tabletBodyOpen\}/);
});

test("mobile editing keeps its body always visible (the toggle is tablet-only)", () => {
  assert.match(src, /\{tabletHud \? \(\s*<button\s+type="button"\s+data-tablet-hud-toggle/);
  assert.doesNotMatch(src, /display: !tabletBodyOpen/);
});
