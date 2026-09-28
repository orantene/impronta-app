import test from "node:test";
import assert from "node:assert/strict";

import { buildTalentLocaleSwaps, clampWords } from "./talent-locale-swaps";

const en = "I studied engineering for three years, until I understood that what I really loved was working with my hands and making people feel beautiful every single day, from the first coffee of the morning until the last client of the night.";
const es = "Estudié ingeniería tres años, hasta que entendí que lo que amaba era trabajar con mis manos y hacer que la gente se sienta bella cada día.";

test("clampWords never cuts mid-word and adds an ellipsis", () => {
  const out = clampWords(en, 60);
  assert.ok(out.endsWith("…"));
  assert.ok(en.startsWith(out.slice(0, -1)));
  assert.ok(en[out.length - 1] === " " || en[out.length - 1] === ",");
});

test("es swaps bio, legacy tagline slice, trade and city", () => {
  const m = buildTalentLocaleSwaps(
    { bioI18n: { en, es }, typeNames: [{ en: "Nail Artist", es: "Manicurista" }], homeCity: { en: "Playa del Carmen" } },
    "es",
  );
  assert.equal(m[en], es);
  assert.equal(m[en.slice(0, 160).trim()], clampWords(es));
  assert.equal(m["Nail Artist"], "Manicurista");
  assert.ok(!("Playa del Carmen" in m));
});

test("missing translation falls back to English (no swap)", () => {
  const m = buildTalentLocaleSwaps({ bioI18n: { en }, typeNames: [{ en: "DJ" }], homeCity: null }, "es");
  assert.ok(!(en in m));
  assert.ok(!("DJ" in m));
  assert.equal(m[en.slice(0, 160).trim()], clampWords(en));
});
