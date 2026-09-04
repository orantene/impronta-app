import test from "node:test";
import assert from "node:assert/strict";

import { INDUSTRY_PRESET_IDS, resolveWords } from "./index";
import { pickSignupPreset } from "./signup-preset";

/**
 * Production said 0 of 13 tenants have an `industry_preset`. These assert the
 * derivation that changes that, and — more importantly — that being WRONG is
 * harder than being absent.
 */

test("every derived preset is a real preset id", () => {
  const descriptions = [
    "Barbershop in Tulum", "Day spa", "Dental clinic", "Cocktail bar",
    "Beach club", "Taqueria", "Yoga studio", "Padel courts", "Diving tours",
    "Cinema", "Coworking space", "Bike rentals", "Print shop",
    "Banquet venue", "Modelling agency", "", "something we cannot classify",
  ];
  for (const businessDescription of descriptions) {
    const id = pickSignupPreset({ audience: "business", businessDescription });
    assert.ok(
      (INDUSTRY_PRESET_IDS as readonly string[]).includes(id),
      `${businessDescription} -> ${id}`,
    );
  }
});

test("an unclassifiable description gets custom, not a guess", () => {
  // The asymmetry this function is built on: a WRONG industry renames a live
  // storefront's nouns; an absent one changes nothing. So it guesses only when
  // it is confident.
  for (const businessDescription of ["", "   ", "we do stuff", "asdfgh", "consulting things"]) {
    assert.equal(pickSignupPreset({ audience: "business", businessDescription }), "custom");
  }
});

test("custom supplies no voice and no verb, so a miss changes nothing", () => {
  // The reason "custom" is the safe default, asserted rather than assumed.
  const words = resolveWords({ presetId: "custom" }, "en");
  assert.equal(words.preset.id, "custom");
  assert.equal(words.headerVerbLabel(), "Get in touch");
  assert.equal(words.word("menu.item"), "Item", "custom must not rename anything");
});

test("the four business types that used to get a print storefront", () => {
  // Salon, barber, spa and clinic had no keyword row anywhere and fell through
  // to `store`. They now derive a real industry too.
  assert.equal(pickSignupPreset({ audience: "business", businessDescription: "Barbershop" }), "salon_barber");
  assert.equal(pickSignupPreset({ audience: "business", businessDescription: "Hair salon" }), "salon_barber");
  assert.equal(pickSignupPreset({ audience: "business", businessDescription: "Day spa and massage" }), "spa_wellness");
  assert.equal(pickSignupPreset({ audience: "business", businessDescription: "Dental clinic" }), "clinic");
});

test("ordering is load-bearing, in both directions", () => {
  // "barber shop" contains "shop"; "cocktail bar" is a bar, not a diner.
  assert.equal(pickSignupPreset({ businessDescription: "Barber shop" }), "salon_barber");
  assert.equal(pickSignupPreset({ businessDescription: "Cocktail bar and kitchen" }), "bar_club");
  // And a plain restaurant is still a restaurant.
  assert.equal(pickSignupPreset({ businessDescription: "Family restaurant" }), "restaurant");
});

test("Spanish descriptions derive too", () => {
  // The funnel collects free text and this is Mexico. A Spanish-speaking
  // operator must not silently land on custom because the keywords are English.
  assert.equal(pickSignupPreset({ businessDescription: "Barbería del centro" }), "salon_barber");
  assert.equal(pickSignupPreset({ businessDescription: "Clínica dental" }), "clinic");
  assert.equal(pickSignupPreset({ businessDescription: "Taquería" }), "restaurant");
  assert.equal(pickSignupPreset({ businessDescription: "Renta de bicis" }), "rentals");
});

test("an agency says what it is by choosing the word", () => {
  assert.equal(pickSignupPreset({ audience: "agency", businessDescription: "" }), "agency");
  assert.equal(pickSignupPreset({ audience: "agency" }), "agency");
  assert.equal(pickSignupPreset({ businessDescription: "Modelling agency" }), "agency");
});

test("business and operator alone are NOT enough to guess from", () => {
  // Each covers a dozen industries. Guessing from them is exactly the
  // wrong-industry risk this avoids.
  assert.equal(pickSignupPreset({ audience: "business" }), "custom");
  assert.equal(pickSignupPreset({ audience: "operator" }), "custom");
  assert.equal(pickSignupPreset({ audience: "organization" }), "custom");
});

test("junk audience and description cannot throw or invent", () => {
  for (const audience of [null, undefined, "", 7 as unknown as string, "WHO_KNOWS"]) {
    const id = pickSignupPreset({ audience, businessDescription: null });
    assert.ok((INDUSTRY_PRESET_IDS as readonly string[]).includes(id));
  }
});

test("a derived preset actually changes what the site says", () => {
  // The end-to-end point: derivation is worthless unless it reaches the words.
  const id = pickSignupPreset({ audience: "business", businessDescription: "Barbershop in Tulum" });
  const words = resolveWords({ presetId: id }, "en");
  assert.equal(words.headerVerbLabel(), "Book");
  assert.equal(words.word("reservations.place"), "Chair");
  const es = resolveWords({ presetId: id }, "es");
  assert.equal(es.word("reservations.place"), "Silla");
});
