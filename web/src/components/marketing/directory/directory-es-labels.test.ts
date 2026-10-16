import test from "node:test";
import assert from "node:assert/strict";
import { agencyLine, locationLine, localizeCityLabel, localizeCountry } from "./shared";
import { DIRECTORY_COPY_ES } from "./directory-copy";

test("country renders in Spanish from name or ISO code, English unchanged", () => {
  assert.equal(localizeCountry("Mexico", "es"), "México");
  assert.equal(localizeCountry("MX", "es"), "México");
  assert.equal(localizeCountry("Mexico", "en"), "Mexico");
  assert.equal(localizeCountry("Atlantis", "es"), "Atlantis");
});

test("locationLine localizes only the country", () => {
  assert.equal(locationLine("Cancún", "Mexico", "es"), "Cancún, México");
  assert.equal(locationLine("Cancún", "Mexico"), "Cancún, Mexico");
});

test("a stored 'Independent' agency reads Independiente in ES", () => {
  assert.equal(agencyLine("Independent", false, DIRECTORY_COPY_ES), "Independiente");
  assert.equal(agencyLine(null, false, DIRECTORY_COPY_ES), "Independiente");
});

test("a city label that already ends with the country localizes that country in ES", () => {
  assert.equal(
    locationLine("Cancún, Quintana Roo, Mexico", "Mexico", "es"),
    "Cancún, Quintana Roo, México",
  );
  assert.equal(locationLine("Tulum, Mexico", "MX", "es"), "Tulum, México");
  assert.equal(
    locationLine("Cancún, Quintana Roo, Mexico", "Mexico"),
    "Cancún, Quintana Roo, Mexico",
  );
});

test("TUL-738: city names are localized part by part on a Spanish page, English untouched", () => {
  assert.equal(locationLine("Mexico City", "Mexico", "es"), "Ciudad de México", "the city already ends with the country: not repeated, particle stays lowercase");
  assert.equal(locationLine("Cancun", "MX", "es"), "Cancún, México");
  assert.equal(
    locationLine("Cancun, Quintana Roo, Mexico", "Mexico", "es"),
    "Cancún, Quintana Roo, México",
  );
  assert.equal(locationLine("Mérida", "MX", "es"), "Mérida, México");
  assert.equal(locationLine("Playa del Carmen", "MX", "es"), "Playa del Carmen, México", "unknown city passes through");
  assert.equal(locationLine("Mexico City", "Mexico", "en"), "Mexico City, Mexico");
  assert.equal(locationLine("Cancun", "MX"), "Cancun, MX");
});

test("smartTitleCase keeps Spanish connectors lowercase after the first word", () => {
  assert.equal(locationLine("playa del carmen", "MX", "es"), "Playa del Carmen, México");
  assert.equal(locationLine("ciudad de mexico", "MX", "es"), "Ciudad de México");
});

test("the city filter label uses the same localization; the filter key is not touched", () => {
  assert.equal(localizeCityLabel("Mexico City", "es"), "Ciudad de México");
  assert.equal(localizeCityLabel("Cancun", "es"), "Cancún");
  assert.equal(localizeCityLabel("Cancun", "en"), "Cancun");
  assert.equal(localizeCityLabel("Tulum", "es"), "Tulum");
});
