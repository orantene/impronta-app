import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import { columnTiers, LIST_COLS, templateMinWidth, trackMinPx, tracks } from "./catalog-list-columns";

/**
 * B2 (consultant QA 2026-10-19): at an 800px window the Catalog list's Item
 * column was BLANK and the table overflowed sideways. The board's template
 * (`1.35fr 120px 1.3fr 90px 150px 120px 150px 24px`) needs 774px before the
 * Item track gets a pixel; the card at 800px of window is about 500px (the
 * shell rail is 240px), so the names truncated to nothing.
 */

// The shipped template before the fix, for the regression sum.
const OLD_TEMPLATE = "1.35fr_120px_1.3fr_90px_150px_120px_150px_24px";
// An 800px window: 240px rail, about 32px of page gutter each side.
const CARD_AT_800 = 800 - 240 - 64;

test("regression: the old template needs more than the card has at 800px, and gives Item 0px", () => {
  assert.ok(templateMinWidth(OLD_TEMPLATE) > CARD_AT_800, `old min ${templateMinWidth(OLD_TEMPLATE)} vs card ${CARD_AT_800}`);
  assert.equal(trackMinPx(tracks(OLD_TEMPLATE)[0]), 0);
});

test("every tier fits inside the card width that switches it on", () => {
  const tiers = columnTiers();
  assert.ok(tiers.length >= 3, "a base tier plus wider tiers");
  assert.equal(tiers[0].minWidth, 0, "the base tier has no container condition");
  for (let i = 1; i < tiers.length; i += 1) {
    assert.ok(tiers[i].minWidth > tiers[i - 1].minWidth, "tiers widen in order");
  }
  for (const tier of tiers) {
    const need = templateMinWidth(tier.template);
    // The base tier applies from 0 up: it must fit the narrowest desktop card (721px window minus the rail and gutters).
    const has = tier.minWidth === 0 ? 721 - 240 - 64 : tier.minWidth;
    assert.ok(need <= has, `tier @${tier.minWidth}px needs ${need}px`);
  }
});

test("the base tier fits the 800px card, so nothing scrolls sideways there", () => {
  const base = columnTiers()[0];
  assert.ok(templateMinWidth(base.template) <= CARD_AT_800);
});

test("the Item track always keeps a real minimum (the name never collapses to nothing)", () => {
  for (const tier of columnTiers()) {
    assert.ok(trackMinPx(tracks(tier.template)[0]) >= 96, `tier @${tier.minWidth}px item min`);
  }
});

test("no fixed track is wider than the board's widest column", () => {
  for (const tier of columnTiers()) {
    for (const tr of tracks(tier.template)) assert.ok(trackMinPx(tr) <= 160, `${tr} at @${tier.minWidth}px`);
  }
});

test("each tier's track count equals the cells shown at that width (head and row agree)", () => {
  const tiers = columnTiers();
  // Item · Price · Status · menu; then + Type, Channels; + Availability; + Preparation.
  assert.deepEqual(tiers.map((t) => tracks(t.template).length), [4, 6, 7, 8]);
  const row = readFileSync(join(__dirname, "CatalogListRow.tsx"), "utf8");
  const list = readFileSync(join(__dirname, "CatalogList.tsx"), "utf8");
  for (const src of [row, list]) {
    assert.equal((src.match(/\$\{CELL_FROM_680(?:_FLEX)?\}/g) ?? []).length, 2, "Type and Channels from 680");
    assert.equal((src.match(/\$\{CELL_FROM_900\}/g) ?? []).length, 1, "Availability from 900");
    assert.equal((src.match(/\$\{CELL_FROM_1080\}/g) ?? []).length, 1, "Preparation from 1080");
    assert.match(src, /cols=\{LIST_COLS\}/);
  }
  assert.match(list, /\$\{LIST_CONTAINER\}/, "the card is the size container the tiers query");
  assert.doesNotMatch(list, /grid-cols-\[1\.35fr_120px/, "the fixed board template is gone");
});

test("the tiers ship as literal classes Tailwind can see", () => {
  assert.match(LIST_COLS, /^grid-cols-\[minmax\(96px,1fr\)/);
  assert.match(LIST_COLS, /@\[680px\]:grid-cols-\[/);
  assert.match(LIST_COLS, /@\[1080px\]:grid-cols-\[minmax\(160px,1\.35fr\)_120px_minmax\(80px,1\.3fr\)_90px_150px_120px_150px_24px\]/);
});
