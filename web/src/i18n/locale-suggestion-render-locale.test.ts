/**
 * The banner must never offer the language the page is ALREADY rendered in.
 * The render locale (the value behind <html lang>) is the truth; the URL-derived
 * `currentLocale` is only a fallback. Card 394: a Spanish page offered
 * "¿Prefieres ver esta página en español?".
 */
import assert from "node:assert/strict";
import test from "node:test";

import { shouldSuggestLocale, type LocaleSuggestionInput } from "@/i18n/locale-suggestion";
import { localeUrlSettings } from "@/i18n/pathnames";

const CHROME = "Mozilla/5.0 (Macintosh) AppleWebKit/537.36 Chrome/120 Safari/537.36";
// A grammar that says "en is the default" while the page was actually rendered in Spanish.
const EN_GRAMMAR = localeUrlSettings("en", ["en", "es"]);
const ES_GRAMMAR = localeUrlSettings("es", ["es", "en"]);

function visit(o: Partial<LocaleSuggestionInput>): LocaleSuggestionInput {
  return {
    acceptLanguage: "es-MX,es;q=0.9",
    currentLocale: "en",
    renderLocale: "es",
    tenantSettings: EN_GRAMMAR,
    pathname: "/",
    userAgent: CHROME,
    ...o,
  };
}

test("Spanish page + Spanish browser: no banner, even when the URL grammar says en", () => {
  assert.equal(shouldSuggestLocale(visit({})).suggest, false);
});

test("Spanish page + Spanish country only (geo): no banner", () => {
  assert.equal(shouldSuggestLocale(visit({ acceptLanguage: null, country: "MX" })).suggest, false);
});

test("Spanish page + English browser: offers English", () => {
  const d = shouldSuggestLocale(
    visit({ acceptLanguage: "en-US,en;q=0.9", tenantSettings: ES_GRAMMAR, currentLocale: "es" }),
  );
  assert.equal(d.suggest, true);
  if (d.suggest) assert.equal(d.locale, "en");
});

test("English page + Spanish browser: offers Spanish", () => {
  const d = shouldSuggestLocale(visit({ renderLocale: "en", currentLocale: "en" }));
  assert.equal(d.suggest, true);
  if (d.suggest) assert.equal(d.locale, "es");
});

test("regional render locale (es-MX) counts as already Spanish", () => {
  assert.equal(shouldSuggestLocale(visit({ renderLocale: "es-MX" })).suggest, false);
});

test("dismissed: no banner", () => {
  assert.equal(shouldSuggestLocale(visit({ renderLocale: "en", dismissed: true })).suggest, false);
});

test("unsupported browser language: no banner", () => {
  const d = shouldSuggestLocale(visit({ renderLocale: "en", acceptLanguage: "fr-FR,fr;q=0.9" }));
  assert.equal(d.suggest, false);
});

test("single-language site: no banner", () => {
  const d = shouldSuggestLocale(
    visit({ tenantSettings: localeUrlSettings("es", ["es"]), acceptLanguage: "en-US" }),
  );
  assert.equal(d.suggest, false);
});

test("a missing render locale falls back to the URL-derived one", () => {
  assert.equal(shouldSuggestLocale(visit({ renderLocale: null, currentLocale: "es" })).suggest, false);
});
