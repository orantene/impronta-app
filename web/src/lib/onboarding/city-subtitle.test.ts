import test from "node:test";
import assert from "node:assert/strict";
import { localizeCitySubtitle } from "./city-subtitle";

test("TUL-803: the country in a Spanish picker row carries its accent", () => {
  assert.equal(localizeCitySubtitle({ subtitle: "Quintana Roo, Mexico", countryIso2: "MX" }, "es"), "Quintana Roo, México");
  assert.equal(localizeCitySubtitle({ subtitle: "Mexico", countryIso2: "MX" }, "es"), "México");
});

test("English, empty and unknown-country rows are untouched", () => {
  assert.equal(localizeCitySubtitle({ subtitle: "Quintana Roo, Mexico", countryIso2: "MX" }, "en"), "Quintana Roo, Mexico");
  assert.equal(localizeCitySubtitle({ subtitle: null, countryIso2: "MX" }, "es"), null);
  assert.equal(localizeCitySubtitle({ subtitle: "Somewhere", countryIso2: "" }, "es"), "Somewhere");
});
