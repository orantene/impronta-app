import assert from "node:assert/strict";
import { test } from "node:test";

import {
  groupMenuByCategory,
  menuCategoryAnchorId,
  shouldShowCategoryNav,
} from "./menu-board-categories";

const item = (id: string, category?: string | null) => ({ id, category });

test("groups by the operator's category, in the operator's order", () => {
  // The arrival order is the order set on the Menu page. Re-sorting here would
  // silently override a deliberate arrangement — a starters-last menu.
  const groups = groupMenuByCategory([
    item("a", "Tacos"),
    item("b", "Postres"),
    item("c", "Tacos"),
  ]);
  assert.deepEqual(groups.map((g) => g.label), ["Tacos", "Postres"]);
  assert.deepEqual(groups[0]!.items.map((i) => i.id), ["a", "c"]);
});

test("uncategorised items collect into ONE trailing bucket, and are not dropped", () => {
  // They are real menu items. Dropping them would remove dishes from a menu to
  // tidy up a nav, and inventing a category name for them would put a word on
  // the page the operator never wrote.
  const groups = groupMenuByCategory([
    item("a", "Tacos"),
    item("b"),
    item("c", null),
    item("d", "   "),
  ]);
  assert.equal(groups.length, 2);
  assert.equal(groups[1]!.label, null);
  assert.deepEqual(groups[1]!.items.map((i) => i.id), ["b", "c", "d"]);
});

test("the strip needs TWO named categories, or it is not navigation", () => {
  const none = groupMenuByCategory([item("a"), item("b")]);
  assert.equal(shouldShowCategoryNav(none), false, "all-null must show no strip");

  const one = groupMenuByCategory([item("a", "Tacos"), item("b")]);
  assert.equal(
    shouldShowCategoryNav(one),
    false,
    "one category is a tab that scrolls to the only thing on screen",
  );

  const two = groupMenuByCategory([item("a", "Tacos"), item("b", "Postres")]);
  assert.equal(shouldShowCategoryNav(two), true);
});

test("El Paisa TODAY gets no strip — its two items are both uncategorised", () => {
  // Measured: `select category, count(*) ... where tenant_id = elpaisa` returns
  // one row, category null, 2 items. Pinned so turning the prop on for the real
  // tenant cannot render an empty strip while the menu import is still pending.
  const groups = groupMenuByCategory([item("a", null), item("b", null)]);
  assert.equal(shouldShowCategoryNav(groups), false);
  assert.equal(groups.length, 1, "one ungrouped bucket, not two empty ones");
});

test("anchor ids are DOM-safe and prefixed, so a category cannot collide with a page anchor", () => {
  assert.equal(menuCategoryAnchorId("Tacos", 0), "menu-tacos");
  assert.equal(menuCategoryAnchorId("Para compartir", 0), "menu-para-compartir");
  // A category called "reserve" must not fight a page anchor of the same name.
  assert.equal(menuCategoryAnchorId("reserve", 0), "menu-reserve");
  // Slugifies to nothing → positional, so the strip still navigates.
  assert.equal(menuCategoryAnchorId("前菜", 3), "menu-group-4");
  assert.equal(menuCategoryAnchorId("!!!", 0), "menu-group-1");
});

test("every anchor id in a grouping is unique", () => {
  // The case that matters, and the one my first version of this test did NOT
  // exercise: "Tacos" and "TACOS!" both slugify to `menu-tacos`, so without a
  // dedupe the second tab scrolls to the FIRST section. The test passed anyway
  // because it only used categories that were already distinct.
  const groups = groupMenuByCategory([
    item("a", "Tacos"),
    item("b", "TACOS!"),
    item("c", "tacos"),
    item("d", "Postres"),
    item("e"),
  ]);
  const ids = groups.map((g) => g.anchorId);
  assert.equal(new Set(ids).size, ids.length, `duplicate anchor ids: ${ids.join(", ")}`);
});
