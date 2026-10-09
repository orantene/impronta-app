import test from "node:test";
import assert from "node:assert/strict";

import { talentLocaleUnavailableCopy } from "./talent-locale-unavailable-copy";

test("Spanish-primary notice is Spanish (en+es pair)", () => {
  const es = talentLocaleUnavailableCopy("es");
  assert.match(es.heading, /solo en español/i);
  assert.match(es.homeCta, /inicio/i);
  assert.doesNotMatch(es.body, /—/);
});

test("English-primary notice is English (en+es pair)", () => {
  const en = talentLocaleUnavailableCopy("en");
  assert.match(en.heading, /English only/i);
  assert.match(en.homeCta, /home/i);
  assert.doesNotMatch(en.body, /—/);
});
