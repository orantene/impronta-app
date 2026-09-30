import assert from "node:assert/strict";
import { test } from "node:test";

import {
  canAiTranslate,
  countTranslated,
  ghostPlaceholder,
  languageName,
  localeStatus,
  nextTabIndex,
  orderLocales,
  outdatedLocales,
  pickAiTarget,
} from "./locale-field-model";

test("orderLocales puts the primary first and dedupes", () => {
  assert.deepEqual(orderLocales("es", ["en", "es", "en", ""]), ["es", "en"]);
  assert.deepEqual(orderLocales("en"), ["en"]);
});

test("localeStatus: filled, missing (blank counts), outdated", () => {
  const map = { es: "Corte", en: "  " };
  assert.equal(localeStatus(map, "es"), "filled");
  assert.equal(localeStatus(map, "en"), "missing");
  assert.equal(localeStatus({ es: "a", en: "b" }, "en", ["en"]), "outdated");
  assert.equal(localeStatus(null, "en", ["en"]), "missing");
});

test("ghostPlaceholder shows the primary text on a secondary only", () => {
  const map = { es: "Corte de pelo" };
  assert.equal(ghostPlaceholder(map, "en", "es"), "Corte de pelo");
  assert.equal(ghostPlaceholder(map, "es", "es", "Name"), "Name");
  assert.equal(ghostPlaceholder({}, "en", "es", "Name"), "Name");
});

test("outdatedLocales flags untouched secondaries after a primary edit", () => {
  const initial = { es: "Corte", en: "Cut", fr: "" };
  assert.deepEqual(outdatedLocales(initial, initial, "es", ["es", "en", "fr"]), []);
  const edited = { es: "Corte largo", en: "Cut" };
  assert.deepEqual(outdatedLocales(initial, edited, "es", ["es", "en", "fr"]), ["en"]);
  const both = { es: "Corte largo", en: "Long cut" };
  assert.deepEqual(outdatedLocales(initial, both, "es", ["es", "en"]), []);
  // A primary written for the first time does not make anything outdated.
  assert.deepEqual(outdatedLocales({ en: "Cut" }, { es: "Corte", en: "Cut" }, "es", ["es", "en"]), []);
});

test("canAiTranslate needs a source and an empty, outdated or stale target", () => {
  assert.equal(canAiTranslate({ source: "", target: "" }), false);
  assert.equal(canAiTranslate({ source: "Corte", target: "" }), true);
  assert.equal(canAiTranslate({ source: "Corte", target: "Cut" }), false);
  assert.equal(canAiTranslate({ source: "Corte", target: "Cut", outdated: true }), true);
  assert.equal(canAiTranslate({ source: "Corte", target: "Cut", lastSource: "Corte" }), false);
  assert.equal(canAiTranslate({ source: "Corte largo", target: "Cut", lastSource: "Corte" }), true);
});

test("pickAiTarget prefers the active secondary, then the first gap", () => {
  const locales = ["es", "en", "fr"];
  assert.equal(pickAiTarget(locales, "es", "fr", { es: "a", en: "", fr: "" }), "fr");
  assert.equal(pickAiTarget(locales, "es", "es", { es: "a", en: "b", fr: "" }), "fr");
  assert.equal(pickAiTarget(locales, "es", "es", { es: "a", en: "b", fr: "c" }, ["fr"]), "fr");
  assert.equal(pickAiTarget(locales, "es", "es", { es: "a", en: "b", fr: "c" }), "en");
  assert.equal(pickAiTarget(["es"], "es", "es", {}), null);
});

test("nextTabIndex wraps with arrows and jumps with Home / End", () => {
  assert.equal(nextTabIndex(0, "ArrowRight", 2), 1);
  assert.equal(nextTabIndex(1, "ArrowRight", 2), 0);
  assert.equal(nextTabIndex(0, "ArrowLeft", 2), 1);
  assert.equal(nextTabIndex(1, "Home", 3), 0);
  assert.equal(nextTabIndex(0, "End", 3), 2);
  assert.equal(nextTabIndex(1, "Tab", 3), 1);
});

test("languageName speaks the dashboard language", () => {
  assert.equal(languageName("en", "en"), "English");
  assert.equal(languageName("en", "es"), "inglés");
  assert.equal(languageName("es", "es", true), "Español");
  assert.equal(languageName("xx", "en"), "XX");
});

test("seedContentLocaleState: cookie when it is a talent language, else primary", async () => {
  const { seedContentLocaleState } = await import("./active-content-locale-store");
  const talent = { primary: "es", secondary: ["en"] };
  assert.deepEqual(seedContentLocaleState("en", talent), {
    locale: "en",
    defaultLocale: "es",
    chain: ["en", "es"],
  });
  assert.equal(seedContentLocaleState("fr", talent).locale, "es");
  assert.equal(seedContentLocaleState(null, talent).locale, "es");
  assert.deepEqual(seedContentLocaleState("es", talent).chain, ["es", "en"]);
});

test("countTranslated counts non-blank entries", () => {
  assert.deepEqual(countTranslated([{ en: "a" }, { en: " " }, null, { es: "x" }], "en"), {
    translated: 1,
    total: 4,
  });
});
