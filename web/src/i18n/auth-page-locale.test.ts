import assert from "node:assert/strict";
import test from "node:test";

import { resolveAuthPageLocale } from "./auth-page-locale";

const base = {
  cookieLocale: null,
  cookieIsAuto: false,
  acceptLanguage: null,
  country: null,
  fallback: "en",
  enabledLocales: ["en", "es"],
} as const;

test("a deliberate cookie wins over a Spanish browser", () => {
  assert.equal(
    resolveAuthPageLocale({ ...base, cookieLocale: "en", acceptLanguage: "es-MX,es;q=0.9", country: "MX" }),
    "en",
  );
  assert.equal(resolveAuthPageLocale({ ...base, cookieLocale: "es", acceptLanguage: "en-US" }), "es");
});

test("an auto-written en cookie does not hide a Spanish signal", () => {
  assert.equal(
    resolveAuthPageLocale({ ...base, cookieLocale: "en", cookieIsAuto: true, acceptLanguage: "es-MX,es;q=0.9" }),
    "es",
  );
  assert.equal(
    resolveAuthPageLocale({ ...base, cookieLocale: "en", cookieIsAuto: true, country: "MX", acceptLanguage: "en-US" }),
    "es",
  );
});

test("no cookie: Spanish browser or Mexico gives Spanish", () => {
  assert.equal(resolveAuthPageLocale({ ...base, acceptLanguage: "es" }), "es");
  assert.equal(resolveAuthPageLocale({ ...base, country: "mx" }), "es");
});

test("no signal keeps the old behaviour", () => {
  assert.equal(resolveAuthPageLocale({ ...base, acceptLanguage: "en-US,en;q=0.9" }), "en");
  assert.equal(resolveAuthPageLocale({ ...base, fallback: "fr", acceptLanguage: "de" }), "fr");
  assert.equal(
    resolveAuthPageLocale({ ...base, cookieLocale: "fr", cookieIsAuto: true, acceptLanguage: "fr" }),
    "fr",
  );
});

test("Spanish is never served where it is not enabled", () => {
  assert.equal(
    resolveAuthPageLocale({ ...base, enabledLocales: ["en"], acceptLanguage: "es-MX", country: "MX" }),
    "en",
  );
});
