import test from "node:test";
import assert from "node:assert/strict";

import { pluralCategory, withPluralization } from "./interpolate";

/**
 * `count === 1` is the English and Spanish rule, not a universal one. French
 * puts ZERO in the singular: "0 membre", never "0 membres". The roles card
 * renders a counted noun in all three languages, so the form has to come from
 * the reader's own locale.
 */

test("English and Spanish put zero in the plural", () => {
  assert.equal(pluralCategory("en", 0), "other");
  assert.equal(pluralCategory("es", 0), "other");
});

test("French puts zero in the singular", () => {
  assert.equal(pluralCategory("fr", 0), "one");
});

test("one is singular and two is plural everywhere here", () => {
  for (const locale of ["en", "es", "fr"]) {
    assert.equal(pluralCategory(locale, 1), "one", locale);
    assert.equal(pluralCategory(locale, 2), "other", locale);
  }
});

test("an unknown or absent locale falls back to the count rule", () => {
  assert.equal(pluralCategory(undefined, 0), "other");
  assert.equal(pluralCategory(undefined, 1), "one");
  assert.equal(pluralCategory("not-a-locale-tag!!", 0), "other");
});

test("a category with no catalog form collapses onto other", () => {
  // Russian's "few"/"many" have no catalogue entry here; only one/other do.
  assert.equal(pluralCategory("ru", 3), "other");
  assert.equal(pluralCategory("ru", 1), "one");
});

test("the translator picks the form the locale asks for", () => {
  const catalog: Record<string, string> = {
    "members.one": "{count} membre",
    "members.other": "{count} membres",
  };
  const t = (key: string) => catalog[key] ?? key;

  assert.equal(withPluralization(t, "fr")("members", 0), "0 membre");
  assert.equal(withPluralization(t, "fr")("members", 1), "1 membre");
  assert.equal(withPluralization(t, "fr")("members", 2), "2 membres");
  assert.equal(withPluralization(t, "en")("members", 0), "0 membres");
});
