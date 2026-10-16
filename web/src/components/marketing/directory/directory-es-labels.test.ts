import test from "node:test";
import assert from "node:assert/strict";
import { agencyLine, locationLine, localizeCountry } from "./shared";
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
