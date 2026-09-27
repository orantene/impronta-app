import assert from "node:assert/strict";
import { test } from "node:test";

import { localizeDefaultHeaderCtaLabel } from "./localize-header-cta";

test("AUD-027: default Inquire localises for Spanish visitors", () => {
  assert.equal(localizeDefaultHeaderCtaLabel("Inquire", "es"), "Consultar");
  assert.equal(localizeDefaultHeaderCtaLabel("INQUIRE", "es"), "Consultar");
  assert.equal(localizeDefaultHeaderCtaLabel("Inquire", "en"), "Inquire");
});

test("AUD-027: custom CTA labels stay as authored", () => {
  assert.equal(localizeDefaultHeaderCtaLabel("Reservar", "es"), "Reservar");
  assert.equal(localizeDefaultHeaderCtaLabel("Book now", "es"), "Book now");
});
