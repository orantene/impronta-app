/**
 * TUL-1099: one keyboard pattern for hand-built menus. Pure index logic plus a static pin that
 * every aria-haspopup="menu" account control opts in (so the next menu cannot quietly skip it).
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import { MENU_ITEM_SELECTOR, nextMenuIndex } from "./use-menu-keyboard";

test("ArrowDown / ArrowUp wrap and start from the ends when focus is on the trigger", () => {
  assert.equal(nextMenuIndex("ArrowDown", -1, 4), 0);
  assert.equal(nextMenuIndex("ArrowDown", 3, 4), 0);
  assert.equal(nextMenuIndex("ArrowDown", 1, 4), 2);
  assert.equal(nextMenuIndex("ArrowUp", -1, 4), 3);
  assert.equal(nextMenuIndex("ArrowUp", 0, 4), 3);
  assert.equal(nextMenuIndex("ArrowUp", 2, 4), 1);
});

test("Home / End jump, other keys and empty menus do nothing", () => {
  assert.equal(nextMenuIndex("Home", 2, 4), 0);
  assert.equal(nextMenuIndex("End", 0, 4), 3);
  assert.equal(nextMenuIndex("a", 0, 4), null);
  assert.equal(nextMenuIndex("ArrowDown", -1, 0), null);
});

test("selector reaches menuitems and the buttons of data-menu-nav strips inside the menu", () => {
  assert.match(MENU_ITEM_SELECTOR, /\[role="menuitem"\]/);
  assert.match(MENU_ITEM_SELECTOR, /\[data-menu-nav\] button/);
});

const WEB = join(__dirname, "..", "..");
const read = (rel: string) => readFileSync(join(WEB, rel), "utf8");

test("hook handles Escape with focus return, Tab close and roving focus", () => {
  const src = read("src/hooks/use-menu-keyboard.ts");
  assert.match(src, /e\.key === "Escape"/);
  assert.match(src, /trigger\(\)\?\.focus\(\)/);
  assert.match(src, /e\.key === "Tab"/);
  assert.match(src, /e\.preventDefault\(\)/);
});

test("every hand-built account / header menu uses the shared hook", () => {
  for (const rel of [
    "src/app/(workspace)/[tenantSlug]/client/_components/ClientAccountMenu.tsx",
    "src/components/admin/shell/internal/page-modules/IdentityBar-1.tsx",
    "src/components/marketing/marketing-account-menu.tsx",
    "src/components/marketing/marketing-language-menu.tsx",
    "src/components/marketing/marketing-support-menu.tsx",
  ]) {
    const src = read(rel);
    assert.match(src, /from "@\/hooks\/use-menu-keyboard"/, rel);
    assert.match(src, /useMenuKeyboard\(/, rel);
  }
});

test("language pills and tab strips inside menus stay reachable (Tab closes the menu)", () => {
  assert.match(read("src/app/(workspace)/[tenantSlug]/client/_components/ClientAccountMenu.tsx"), /data-menu-nav/);
  assert.match(read("src/components/admin/shell/internal/page-modules/IdentityBar-1.tsx"), /data-menu-nav/);
  assert.match(read("src/components/marketing/marketing-account-menu.tsx"), /data-menu-nav/);
});
