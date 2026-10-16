import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const src = readFileSync(new URL("./public-header-mobile-menu.tsx", import.meta.url), "utf8");

test("TUL-697: drawer content carries the data hook the floating-chrome stack keys on", () => {
  assert.match(src, /data-public-header-menu\b/);
});

test("TUL-697: drawer renders the nav links list when navLinks are present", () => {
  assert.match(src, /filteredNavLinks\.map|filteredNavLinks\.length/);
});
