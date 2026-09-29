import test from "node:test";
import assert from "node:assert/strict";

import {
  safeTalentNextPath,
  talentLocaleSeedHref,
  talentLocaleSeedTarget,
} from "./talent-locale-seed";

test("absent cookie seeds the primary", () => {
  assert.equal(talentLocaleSeedTarget({ cookieLocale: null, cookieIsAuto: false, primary: "es" }), "es");
});

test("auto cookie that differs is re-seeded", () => {
  assert.equal(talentLocaleSeedTarget({ cookieLocale: "en", cookieIsAuto: true, primary: "es" }), "es");
});

test("auto cookie already on the primary is left alone", () => {
  assert.equal(talentLocaleSeedTarget({ cookieLocale: "es", cookieIsAuto: true, primary: "es" }), null);
});

test("a deliberate cookie is never overwritten", () => {
  assert.equal(talentLocaleSeedTarget({ cookieLocale: "en", cookieIsAuto: false, primary: "es" }), null);
});

test("next path guard keeps same-origin /talent paths only", () => {
  assert.equal(safeTalentNextPath("/talent/inbox?tab=1"), "/talent/inbox?tab=1");
  assert.equal(safeTalentNextPath("/talent"), "/talent");
  assert.equal(safeTalentNextPath("//evil.example/talent"), "/talent/today");
  assert.equal(safeTalentNextPath("https://evil.example/talent"), "/talent/today");
  assert.equal(safeTalentNextPath("/\\evil.example"), "/talent/today");
  assert.equal(safeTalentNextPath("/admin"), "/talent/today");
  assert.equal(safeTalentNextPath("/talentx"), "/talent/today");
  assert.equal(safeTalentNextPath(null), "/talent/today");
});

test("seed href encodes the guarded next path", () => {
  assert.equal(talentLocaleSeedHref("/talent/inbox"), "/api/talent/locale-seed?next=%2Ftalent%2Finbox");
});
