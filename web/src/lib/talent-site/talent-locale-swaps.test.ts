import test from "node:test";
import assert from "node:assert/strict";

import {
  buildTalentLocaleSwaps,
  clampWords,
  localiseBakedLanguagesLine,
} from "./talent-locale-swaps";

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

test("the talent's chain picks the primary before English", () => {
  // French visitor on an ES-primary site (chain [fr, es]): no fr copy, so the
  // primary Spanish reads, never an empty string.
  const m = buildTalentLocaleSwaps(
    { bioI18n: { en, es }, typeNames: [{ en: "Nail Artist", es: "Manicurista" }], homeCity: null },
    "fr",
    ["fr", "es", "en"],
  );
  assert.equal(m[en], es);
  assert.equal(m["Nail Artist"], "Manicurista");
  // Without a chain the old behaviour holds: English, so no swap.
  assert.ok(!(en in buildTalentLocaleSwaps({ bioI18n: { en, es }, typeNames: [], homeCity: null }, "fr")));
});

test("missing translation falls back to English (no swap)", () => {
  const m = buildTalentLocaleSwaps({ bioI18n: { en }, typeNames: [{ en: "DJ" }], homeCity: null }, "es");
  assert.ok(!(en in m));
  assert.ok(!("DJ" in m));
  assert.equal(m[en.slice(0, 160).trim()], clampWords(en));
});

test("the marquee's baked English service titles swap to the locale's title (platform)", () => {
  const offerings = [
    { title: "Russian manicure with gel", titleI18n: { en: "Russian manicure with gel", es: "Manicura rusa con gel" } },
    { title: "Semi-permanent gel, hands", titleI18n: { en: "Semi-permanent gel, hands", es: "Esmaltado semipermanente, manos" } },
    { title: "Untranslated", titleI18n: { en: "Untranslated" } },
  ];
  const es = buildTalentLocaleSwaps({ bioI18n: null, typeNames: [], homeCity: null, offerings }, "es");
  assert.equal(es["Russian manicure with gel"], "Manicura rusa con gel");
  assert.equal(es["Semi-permanent gel, hands"], "Esmaltado semipermanente, manos");
  assert.ok(!("Untranslated" in es), "no translation means no swap");
  const en = buildTalentLocaleSwaps({ bioI18n: null, typeNames: [], homeCity: null, offerings }, "en");
  assert.deepEqual(en, {});
});

test("a ticker baked from the plain title column swaps like the English map entry, and a one-language title keeps its text (TUL-189)", () => {
  const offerings = [
    // Plain column differs from the English map entry: either spelling may be baked.
    { title: "Soft gel extensions", titleI18n: { en: "Soft gel extensions (new set)", es: "Extensiones de gel blando" } },
    // Only English stored: no Spanish name to swap in, so the baked text stays.
    { title: "Semi-permanent gel", titleI18n: { en: "Semi-permanent gel" } },
    // No map at all.
    { title: "Pedicure", titleI18n: null },
  ];
  const es = buildTalentLocaleSwaps({ bioI18n: null, typeNames: [], homeCity: null, offerings }, "es");
  assert.equal(es["Soft gel extensions"], "Extensiones de gel blando");
  assert.equal(es["Soft gel extensions (new set)"], "Extensiones de gel blando");
  assert.ok(!("Semi-permanent gel" in es));
  assert.ok(!("Pedicure" in es));
  const en = buildTalentLocaleSwaps({ bioI18n: null, typeNames: [], homeCity: null, offerings }, "en");
  assert.equal(en["Soft gel extensions"], "Soft gel extensions (new set)");
});

test("an ASCII-folded baked city swaps to its accented form, alone and in the eyebrow (data)", () => {
  const src = {
    bioI18n: null,
    typeNames: [{ en: "Nail Artist", es: "Manicurista" }],
    homeCity: { en: "Cancun", es: "Cancún" },
    cityAliases: ["Cancun"],
  };
  const es = buildTalentLocaleSwaps(src, "es");
  assert.equal(es["Cancun"], "Cancún");
  assert.equal(es["Nail Artist · Cancun"], "Manicurista · Cancún");
  assert.equal(es["Based in Cancun"], "Con base en Cancún");
  const en = buildTalentLocaleSwaps({ ...src, homeCity: { en: "Cancún" } }, "en");
  assert.equal(en["Cancun"], "Cancún");
});

test("ES swaps the baked About languages line (TUL-121 design polish)", () => {
  const src = {
    bioI18n: null,
    typeNames: [],
    homeCity: null,
    proof: { languages: ["English"] },
  };
  const es = buildTalentLocaleSwaps(src, "es");
  assert.equal(es["Languages: English"], "Idiomas: Inglés");
  const bilingual = buildTalentLocaleSwaps(
    { ...src, proof: { languages: ["Spanish", "English"] } },
    "es",
  );
  assert.equal(bilingual["Languages: Spanish · English"], "Idiomas: Español · Inglés");
  assert.ok(!("Languages: English" in buildTalentLocaleSwaps(src, "en")));
});

test("localiseBakedLanguagesLine translates any Languages seed without current proof (Codex P2)", () => {
  // Tree baked "Languages: English"; talent later added Spanish — proof list
  // no longer matches the stored text. Pattern still rewrites the baked line.
  assert.equal(localiseBakedLanguagesLine("Languages: English", "es"), "Idiomas: Inglés");
  assert.equal(
    localiseBakedLanguagesLine("Languages: Spanish · English", "es"),
    "Idiomas: Español · Inglés",
  );
  assert.equal(
    localiseBakedLanguagesLine("Languages: French · German", "es"),
    "Idiomas: Francés · Alemán",
  );
  assert.equal(localiseBakedLanguagesLine("Languages: English", "en"), null);
  assert.equal(localiseBakedLanguagesLine("I speak English", "es"), null);
  assert.equal(localiseBakedLanguagesLine("Idiomas: Inglés", "es"), null);
});
