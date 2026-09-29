import test from "node:test";
import assert from "node:assert/strict";

import {
  buildTalentLocaleSettings,
  normalizeTalentLocalePair,
} from "./talent-locale-settings";

const PUB = ["en", "es", "fr"];

test("null primary falls back to platform default; no secondary hides switcher", () => {
  const s = buildTalentLocaleSettings(null, [], PUB, "en");
  assert.equal(s.defaultLocale, "en");
  assert.deepEqual([...s.supportedLocales], ["en"]);
  assert.equal(s.showLanguageSwitcher, false);
});

test("primary not public falls back to platform default", () => {
  const s = buildTalentLocaleSettings("de", ["es"], PUB, "en");
  assert.equal(s.defaultLocale, "en");
  assert.deepEqual([...s.secondaryLocales], ["es"]);
  assert.equal(s.showLanguageSwitcher, true);
});

test("platform default not public falls back to first public locale", () => {
  assert.equal(normalizeTalentLocalePair(null, [], ["es", "fr"], "en").primary, "es");
});

test("secondary including the primary is excluded", () => {
  const s = buildTalentLocaleSettings("es", ["es", "en"], PUB, "en");
  assert.equal(s.defaultLocale, "es");
  assert.deepEqual([...s.secondaryLocales], ["en"]);
  assert.deepEqual([...s.supportedLocales], ["es", "en"]);
});

test("secondary is deduped, order-preserving", () => {
  const p = normalizeTalentLocalePair("en", ["fr", "es", "fr", "es"], PUB);
  assert.deepEqual([...p.secondary], ["fr", "es"]);
});

test("non-public and junk secondary values are dropped", () => {
  const p = normalizeTalentLocalePair("en", ["de", "", null, "es", "not a locale"], PUB);
  assert.deepEqual([...p.secondary], ["es"]);
});

test("fallback chain walks requested, primary, then the rest", () => {
  const s = buildTalentLocaleSettings("es", ["en", "fr"], PUB, "en");
  assert.deepEqual(s.fallbackChain("fr"), ["fr", "es", "en"]);
});
