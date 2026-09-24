import assert from "node:assert/strict";
import test from "node:test";

import { boundTalentFallbackLocale } from "./talent-locale";

const PUBLIC = ["en", "es"];

test("a supported preference is returned as-is", () => {
  assert.equal(boundTalentFallbackLocale("es", PUBLIC), "es");
});

test("no stored preference returns undefined, not the platform default", () => {
  assert.equal(boundTalentFallbackLocale(null, PUBLIC), undefined);
});

test("a preference the platform no longer publishes returns undefined", () => {
  assert.equal(boundTalentFallbackLocale("fr", PUBLIC), undefined);
});

test("an empty public-locale set never returns a preference", () => {
  assert.equal(boundTalentFallbackLocale("es", []), undefined);
});
