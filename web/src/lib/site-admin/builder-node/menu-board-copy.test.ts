/**
 * menu-board-copy.test.ts — the operator's nouns reach the board, and the
 * fallback path never leaks a token.
 *
 * Three catalog sentences used to have the English noun baked in ("1 item
 * selected"). A Restaurant preset renames `menu.item` to "Dish", so the board
 * said "items" while every other surface said dishes. They are interpolations
 * now — which introduces a second failure mode this file exists to prevent: if
 * substitution were conditional on the words load succeeding, an outage would
 * render a literal `{nounPlural}` to a customer.
 */

import assert from "node:assert/strict";
import test from "node:test";

import { menuBoardCopy } from "./menu-board-copy";

const LOCALE = { locale: "en", defaultLocale: "en", chain: ["en"] as const };

test("the operator's noun replaces the baked-in English one", () => {
  const copy = menuBoardCopy(LOCALE, {
    soldOut: "Gone",
    orderSent: "In the kitchen",
    cta: "Order",
    noun: "Dish",
    nounPlural: "Dishes",
  });
  assert.match(copy.itemsSelected, /Dishes/);
  assert.match(copy.itemsSelectedOne, /Dish/);
  assert.match(copy.selectAtLeastOne, /Dishes/);
  assert.doesNotMatch(copy.itemsSelected, /item/i);
});

test("NO TOKEN ever reaches a customer, words or not", () => {
  // The fallback path is the one that matters: absent `words` (a load failure,
  // or a render with no tenant) must still produce a readable sentence.
  for (const copy of [
    menuBoardCopy(LOCALE),
    menuBoardCopy(LOCALE, {
      soldOut: "",
      orderSent: "",
      cta: "",
      noun: "",
      nounPlural: "",
    }),
  ]) {
    for (const [key, value] of Object.entries(copy)) {
      assert.doesNotMatch(
        value,
        /\{noun/,
        `${key} leaked a noun token: ${value}`,
      );
    }
    assert.match(copy.itemsSelected, /items/);
    assert.match(copy.itemsSelectedOne, /item/);
  }
});

test("{count} survives for the island to fill", () => {
  const copy = menuBoardCopy(LOCALE, {
    soldOut: "x",
    orderSent: "x",
    cta: "x",
    noun: "Dish",
    nounPlural: "Dishes",
  });
  assert.match(
    copy.itemsSelected,
    /\{count\}/,
    "the island interpolates {count} at render; substituting nouns must not consume it",
  );
});

test("nounPlural is substituted before noun", () => {
  // `{nounPlural}` contains `{noun}` as a prefix. Replacing the singular first
  // would turn "{nounPlural}" into "DishPlural".
  const copy = menuBoardCopy(LOCALE, {
    soldOut: "x",
    orderSent: "x",
    cta: "x",
    noun: "Dish",
    nounPlural: "Dishes",
  });
  assert.doesNotMatch(copy.itemsSelected, /Plural/);
});

test("an empty operator noun falls back rather than blanking the sentence", () => {
  const copy = menuBoardCopy(LOCALE, {
    soldOut: "Gone",
    orderSent: "x",
    cta: "x",
    noun: "   ",
    nounPlural: "   ",
  });
  assert.match(copy.itemsSelectedOne, /item/);
  assert.equal(copy.soldOut, "Gone", "a blank noun must not discard other words");
});

test("es and fr resolve without leaking a token", () => {
  for (const locale of ["es", "fr"]) {
    const copy = menuBoardCopy({ locale, defaultLocale: locale, chain: [locale] });
    for (const [key, value] of Object.entries(copy)) {
      assert.doesNotMatch(value, /\{noun/, `${locale}.${key} leaked: ${value}`);
    }
  }
});
