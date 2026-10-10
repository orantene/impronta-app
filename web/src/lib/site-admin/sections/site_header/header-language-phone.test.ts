/**
 * GRK-030: language stays visible in the header on phone (not folded into the menu).
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { headerItemAttrs, headerItemMobileDefault } from "./header-site-chrome";
import type { HeaderItem } from "./schema";

test("language defaults to show on phone so bilingual demos keep a visible switch", () => {
  const item = { type: "language" } as HeaderItem;
  assert.equal(headerItemMobileDefault(item), "show");
  assert.equal(headerItemAttrs(item)["data-bp-mobile"], "show");
});

test("an owner choice still wins over the phone default", () => {
  const item = { type: "language", responsive: { mobile: "menu" } } as HeaderItem;
  assert.equal(headerItemAttrs(item)["data-bp-mobile"], "menu");
});
