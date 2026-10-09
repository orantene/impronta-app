import test from "node:test";
import assert from "node:assert/strict";

import { talentLocaleUnavailableCopy } from "./talent-locale-unavailable-copy";

test("TUL-516 B1: Spanish-primary notice is explicit and has no em dash", () => {
  const c = talentLocaleUnavailableCopy("es");
  assert.match(c.heading, /Este sitio está solo en español/);
  assert.match(c.body, /No hay una versión en inglés/);
  assert.equal(c.homeCta, "Ir al inicio");
  assert.doesNotMatch(`${c.title}${c.heading}${c.body}${c.homeCta}`, /\u2014|\u2013/);
});

test("TUL-516 B1: English-primary notice mirrors the Spanish contract", () => {
  const c = talentLocaleUnavailableCopy("en");
  assert.match(c.heading, /English only/i);
  assert.equal(c.homeCta, "Go to homepage");
  assert.doesNotMatch(`${c.title}${c.heading}${c.body}`, /\u2014|\u2013/);
});
