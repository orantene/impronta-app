import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { i18nPair, mergeI18n, readI18n, toI18nMap } from "./i18n-columns";

describe("readI18n", () => {
  it("prefers the exact locale, then the chain, then the plain column", () => {
    const map = { es: "Hola", en: "Hello" };
    assert.equal(readI18n(map, "Plain", "en", ["en", "es"]), "Hello");
    assert.equal(readI18n({ es: "Hola" }, "Plain", "en", ["en", "es"]), "Hola");
    assert.equal(readI18n({}, "Plain", "en", ["en", "es"]), "Plain");
    assert.equal(readI18n(null, "Plain", "fr"), "Plain");
  });

  it("uses any populated locale before returning empty", () => {
    assert.equal(readI18n({ de: "Hallo" }, "", "en", ["en"]), "Hallo");
    assert.equal(readI18n(undefined, null, "en"), "");
  });

  it("ignores blanks and non-string junk", () => {
    assert.equal(readI18n({ en: "  ", es: 3 }, "Plain", "en", ["en", "es"]), "Plain");
    assert.deepEqual(toI18nMap(["x"]), {});
  });
});

describe("mergeI18n / i18nPair", () => {
  it("merges and deletes on empty", () => {
    assert.deepEqual(mergeI18n({ es: "Hola", en: "Hi" }, { en: "Hello", es: "" }), { en: "Hello" });
  });

  it("i18nPair sets the primary and keeps every other language", () => {
    assert.deepEqual(i18nPair({ es: "Hola", en: "Old" }, "Hello", "en"), { es: "Hola", en: "Hello" });
    assert.deepEqual(i18nPair(undefined, "Hello", "en"), { en: "Hello" });
    assert.deepEqual(i18nPair({ es: "Hola", en: "Old" }, "", "en"), { es: "Hola" });
    assert.deepEqual(i18nPair(null, null, "es"), {});
  });
});
