import assert from "node:assert/strict";
import test from "node:test";

import { resolveEssentialsTimezone } from "./essentials-resolve";
import { suggestedEssentials } from "./essentials";

test("Mexico country defaults to Mexico City", () => {
  assert.equal(resolveEssentialsTimezone({ timezone: null, city: null, country: "MX" }), "America/Mexico_City");
  assert.equal(resolveEssentialsTimezone({ timezone: null, city: null, country: "México", locale: "es" }), "America/Mexico_City");
});

test("Spanish flow with no country defaults to Mexico City; an explicit other country wins", () => {
  assert.equal(resolveEssentialsTimezone({ timezone: null, city: null, country: null, locale: "es" }), "America/Mexico_City");
  assert.equal(resolveEssentialsTimezone({ timezone: null, city: null, country: "CO", locale: "es" }), "America/Bogota");
  assert.equal(resolveEssentialsTimezone({ timezone: null, city: null, country: null, locale: "en" }), null);
});

test("the essentials screen opens with the same default", () => {
  assert.equal(suggestedEssentials({ trade: "lashes", country: null, locale: "es" }).timezone, "America/Mexico_City");
  assert.equal(suggestedEssentials({ trade: "lashes", country: "MX", locale: "en" }).timezone, "America/Mexico_City");
  assert.equal(suggestedEssentials({ trade: "lashes", country: null, locale: "en" }).timezone, null);
});
