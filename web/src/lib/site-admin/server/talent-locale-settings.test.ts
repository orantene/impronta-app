import test from "node:test";
import assert from "node:assert/strict";

import {
  buildTalentLocaleSettings,
  normalizeTalentLocalePair,
  talentSeedPrimary,
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

// 2026-09-29 QA regression: Alba (preferred_locale='es') flip-flopped ES/EN.
// A degraded read fell back to the platform default ('en') and the seed wrote
// it over the auto cookie. Seeding must only ever use a CONFIRMED primary.
test("seed primary: stored public preference is confirmed", () => {
  assert.equal(talentSeedPrimary({ rowRead: true, preferred: "es", publicLocales: PUB }), "es");
});

test("seed primary: unreadable row never seeds the platform default", () => {
  assert.equal(talentSeedPrimary({ rowRead: false, preferred: null, publicLocales: PUB }), null);
  assert.equal(buildTalentLocaleSettings(null, [], PUB, "en").defaultLocale, "en");
});

test("seed primary: language settings unavailable never seeds", () => {
  assert.equal(talentSeedPrimary({ rowRead: true, preferred: "es", publicLocales: null }), null);
});

test("seed primary: unset or non-public preference never seeds", () => {
  assert.equal(talentSeedPrimary({ rowRead: true, preferred: null, publicLocales: PUB }), null);
  assert.equal(talentSeedPrimary({ rowRead: true, preferred: "de", publicLocales: PUB }), null);
});
