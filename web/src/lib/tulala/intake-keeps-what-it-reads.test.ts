import test from "node:test";
import assert from "node:assert/strict";

import { validateFactValue, isKnownFactKey, factKeyDef } from "./fact-keys";
import { EXTRACTION_SCHEMA, IMPORT_EXTRACTION_SCHEMA } from "./extraction";

/**
 * The widened intake. Measured before any of this existed: El Paisa's menu URL
 * through the live intake returned "2 things understood" of a complete menu
 * page — the name and a category. Hours, socials, logo, palette and every dish
 * and price were fetched and discarded, because the vocabulary had nowhere to
 * put them and the extractor was capped at 12 facts.
 */

test("the facts a menu page carries are all expressible now", () => {
  for (const key of [
    "business.hours", "presence.facebook_url", "presence.whatsapp",
    "brand.logo_url", "brand.palette", "menu.categories", "menu.items",
  ]) {
    assert.ok(isKnownFactKey(key), `${key} would be rejected by isKnownFactKey`);
  }
});

test("a menu crosses the string-only model boundary", () => {
  // `EXTRACTION_SCHEMA` is strict with `value: { type: "string" }`, so a model
  // physically cannot return an array. Encoded JSON is the only way through,
  // and the coercion must accept it — otherwise every menu is rejected at the
  // last step and logged as "a prompt or vocabulary bug".
  const encoded = JSON.stringify([
    { name: "Tacos al pastor", price: 120, category: "Tacos" },
    { name: "Agua fresca", price: 35 },
  ]);
  const got = validateFactValue("menu.items", encoded);
  assert.equal(got.ok, true, got.ok ? "" : got.error);
  assert.deepEqual(got.ok && got.value, [
    { name: "Tacos al pastor", price: 120, category: "Tacos" },
    { name: "Agua fresca", price: 35 },
  ]);
});

test("a price is a number or it is absent — never a guess", () => {
  // "12.50 MXN" is not a parsed price. Guessing which part is the amount is how
  // a menu ships with wrong prices on it, and a wrong price is worse than none.
  const bad = validateFactValue("menu.items", JSON.stringify([{ name: "Flan", price: "120 MXN" }]));
  assert.equal(bad.ok, false);

  const priceless = validateFactValue("menu.items", JSON.stringify([{ name: "Flan" }]));
  assert.equal(priceless.ok, true, "an item with no price must still be kept");
  assert.deepEqual(priceless.ok && priceless.value, [{ name: "Flan" }]);
});

test("a nameless item is refused, and junk cannot become a menu", () => {
  for (const value of ["not json", JSON.stringify([{ price: 10 }]), JSON.stringify(["Flan"]), 42]) {
    assert.equal(validateFactValue("menu.items", value).ok, false, String(value));
  }
});

test("the palette does not validate contrast, deliberately", () => {
  // Roles are guessed by luminance downstream and a failing colour is DEMOTED
  // rather than refused, so validating here would bounce a brief on a colour
  // the brand mapper would have accepted. El Paisa's red and amber both fail as
  // text and both survive.
  const got = validateFactValue("brand.palette", ["#c1121f", "#e8a33d", "#fdf6e3"]);
  assert.equal(got.ok, true);
  assert.equal(factKeyDef("brand.palette")?.type, "string_list");
});

test("the import cap is higher than the conversational one, and separate", () => {
  // A turn yields a few facts; a menu page yields dozens. Under the shared cap
  // the extractor returns the first twelve and nothing says which it dropped —
  // a silent truncation that reads exactly like "the page did not say".
  const items = (s: typeof EXTRACTION_SCHEMA) =>
    ((s.schema as { properties: { facts: { maxItems: number } } }).properties.facts.maxItems);
  assert.equal(items(EXTRACTION_SCHEMA), 12, "the conversational cap must not drift");
  assert.ok(items(IMPORT_EXTRACTION_SCHEMA) > items(EXTRACTION_SCHEMA));
  assert.equal(items(IMPORT_EXTRACTION_SCHEMA), 40);
});

test("none of the new keys can vote on what KIND of business this is", () => {
  // The shape facts carry evidence weights and decide what someone is charged.
  // What a site is MADE OF must never move that classifier: a long menu is not
  // evidence of staff.
  for (const key of ["business.hours", "brand.palette", "menu.items", "menu.categories"]) {
    assert.equal(factKeyDef(key)?.evidence, undefined, `${key} must carry no evidence weight`);
  }
});
