import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { nextDockTabIndex } from "./guest-dock-nav-keys";

test("TUL-1082: arrows move and wrap", () => {
  assert.equal(nextDockTabIndex("ArrowRight", 0, 3), 1);
  assert.equal(nextDockTabIndex("ArrowRight", 2, 3), 0);
  assert.equal(nextDockTabIndex("ArrowLeft", 0, 3), 2);
  assert.equal(nextDockTabIndex("ArrowUp", 1, 3), 0);
});

test("TUL-1082: Home/End jump; other keys pass through", () => {
  assert.equal(nextDockTabIndex("Home", 2, 3), 0);
  assert.equal(nextDockTabIndex("End", 0, 3), 2);
  assert.equal(nextDockTabIndex("Tab", 0, 3), null);
  assert.equal(nextDockTabIndex("Enter", 0, 3), null);
  assert.equal(nextDockTabIndex("ArrowRight", 0, 0), null);
});

test("TUL-1082: nav wires roving tabindex + keydown", () => {
  const src = readFileSync(join(__dirname, "GuestDockNav.tsx"), "utf8");
  assert.match(src, /onKeyDown=/);
  assert.match(src, /nextDockTabIndex\(/);
  assert.match(src, /tabIndex=\{isActive \? 0 : -1\}/);
});
