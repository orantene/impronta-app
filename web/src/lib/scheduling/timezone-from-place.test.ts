/**
 * F48: a talent's timezone comes from the city she saved, not a hardcoded zone.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { cityLabelFromPlaceText, timezoneFromPlaceText } from "./timezone-from-place";
import { isValidIanaTimeZone } from "./tz";

test("Ciudad de México resolves to America/Mexico_City, not Cancun", () => {
  assert.equal(timezoneFromPlaceText("Ciudad de México, CDMX, Mexico"), "America/Mexico_City");
  assert.equal(timezoneFromPlaceText("Guadalajara, Jalisco, México"), "America/Mexico_City");
  assert.equal(timezoneFromPlaceText("CDMX"), "America/Mexico_City");
  // TUL-516 D4: Morelia must stay on Central Mexico, never a coastal zone.
  assert.equal(timezoneFromPlaceText("Morelia, Michoacán, Mexico"), "America/Mexico_City");
  assert.equal(timezoneFromPlaceText("Morelia"), "America/Mexico_City");
});

test("multi-zone countries match the state or city", () => {
  assert.equal(timezoneFromPlaceText("Tulum, Quintana Roo, Mexico"), "America/Cancun");
  assert.equal(timezoneFromPlaceText("Tijuana, Baja California, Mexico"), "America/Tijuana");
  assert.equal(timezoneFromPlaceText("Cabo San Lucas, Baja California Sur, Mexico"), "America/Mazatlan");
  assert.equal(timezoneFromPlaceText("Los Angeles, CA, USA"), "America/Los_Angeles");
  assert.equal(timezoneFromPlaceText("Austin, TX, USA"), "America/Chicago");
  // TUL-516 D3: Houston is Central Time (America/Chicago IANA), not Eastern.
  assert.equal(timezoneFromPlaceText("Houston, TX, USA"), "America/Chicago");
  assert.equal(timezoneFromPlaceText("Houston"), "America/Chicago");
  assert.equal(timezoneFromPlaceText("Brooklyn, NY, USA"), "America/New_York");
  assert.equal(timezoneFromPlaceText("Madrid, Spain"), "Europe/Madrid");
});

test("single-zone countries and unknown text", () => {
  assert.equal(timezoneFromPlaceText("Bogotá, Colombia"), "America/Bogota");
  assert.equal(timezoneFromPlaceText("Milan, Metropolitan City of Milan, Italy"), "Europe/Rome");
  assert.equal(timezoneFromPlaceText(""), null);
  assert.equal(timezoneFromPlaceText(null), null);
  assert.equal(timezoneFromPlaceText("Somewhere, Atlantis"), null);
});

test("every zone it can return is a valid IANA zone", () => {
  for (const text of ["Ciudad de México, CDMX, Mexico", "Tulum, Quintana Roo, Mexico", "Hermosillo, Sonora, Mexico", "Buenos Aires, Argentina"]) {
    const tz = timezoneFromPlaceText(text);
    assert.ok(tz && isValidIanaTimeZone(tz), `${text} -> ${tz}`);
  }
});

test("city label is the first segment", () => {
  assert.equal(cityLabelFromPlaceText("Ciudad de México, CDMX, Mexico"), "Ciudad de México");
  assert.equal(cityLabelFromPlaceText("  "), null);
});
