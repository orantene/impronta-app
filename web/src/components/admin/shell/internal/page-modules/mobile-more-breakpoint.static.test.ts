import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const src = readFileSync(join(__dirname, "MobileBottomNav.tsx"), "utf8");

test("TUL-907: More sheet closes when the viewport leaves the phone breakpoint", () => {
  assert.match(src, /matchMedia\("\(min-width: 721px\)"\)/);
  assert.match(src, /setMoreOpen\(false\);\s*setMyWorkOpen\(false\)/);
  // the hook sits before the POS early return (rules of hooks)
  assert.ok(src.indexOf("min-width: 721px") < src.indexOf("if (onPosRoute) return null;"));
});
