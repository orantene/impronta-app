import assert from "node:assert/strict";
import test from "node:test";

import { secondaryLocalesFromBioEntries } from "./bilingual-bio";
import { secondaryLocalesToEnable } from "./talent-secondary-locales-from-bio";

test("Spanish flow with both bios enables en as secondary", () => {
  const entries = [
    { locale: "es" as const, text: "Soy Rosa." },
    { locale: "en" as const, text: "I'm Rosa." },
  ];
  assert.deepEqual(secondaryLocalesFromBioEntries(entries, "es"), ["en"]);
  assert.deepEqual(secondaryLocalesToEnable(entries, "es", []), ["en"]);
});

test("English flow with both bios enables es as secondary", () => {
  const entries = [
    { locale: "en" as const, text: "I'm Rosa." },
    { locale: "es" as const, text: "Soy Rosa." },
  ];
  assert.deepEqual(secondaryLocalesFromBioEntries(entries, "en"), ["es"]);
});

test("primary locale is never listed as secondary", () => {
  assert.deepEqual(
    secondaryLocalesFromBioEntries([{ locale: "es", text: "Soy Rosa." }], "es"),
    [],
  );
});

test("add-only: an existing secondary list is not wiped and skips duplicates", () => {
  const entries = [
    { locale: "es" as const, text: "Soy Rosa." },
    { locale: "en" as const, text: "I'm Rosa." },
  ];
  assert.deepEqual(secondaryLocalesToEnable(entries, "es", ["en"]), []);
  assert.deepEqual(secondaryLocalesToEnable(entries, "es", ["fr"]), ["en"]);
});

test("no bio entries means nothing to enable", () => {
  assert.deepEqual(secondaryLocalesToEnable([], "es", []), []);
});
