/**
 * TUL-518: `/t/<code>?lang=es` must resolve to Spanish even when the path has
 * no `/es` prefix and the middleware header still says the unprefixed default.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { localeFromSearch, resolveRequestLocale } from "./resolve-request-locale";

const LOCALES = {
  publicLocales: ["en", "es"],
  defaultLocale: "en",
};

describe("localeFromSearch", () => {
  it("reads lang then locale", () => {
    assert.equal(localeFromSearch("?lang=es"), "es");
    assert.equal(localeFromSearch("?locale=es&foo=1"), "es");
    assert.equal(localeFromSearch("lang=en"), "en");
    assert.equal(localeFromSearch("?q=x"), null);
    assert.equal(localeFromSearch(null), null);
  });
});

describe("resolveRequestLocale (TUL-518 hub ?lang=)", () => {
  it("honors ?lang=es on an unprefixed hub profile URL", () => {
    assert.equal(
      resolveRequestLocale({
        ...LOCALES,
        headerLocale: "en",
        pathname: "/t/TAL-00031",
        search: "?lang=es",
        cookieLocale: null,
      }),
      "es",
    );
  });

  it("path prefix beats a conflicting query", () => {
    assert.equal(
      resolveRequestLocale({
        ...LOCALES,
        headerLocale: "es",
        pathname: "/es/t/TAL-00031",
        search: "?lang=en",
        cookieLocale: null,
      }),
      "es",
    );
  });

  it("TUL-1187: unprefixed path: the locale cookie beats the path-derived header", () => {
    assert.equal(
      resolveRequestLocale({
        ...LOCALES,
        headerLocale: "en",
        pathname: "/directory",
        search: "",
        cookieLocale: "es",
      }),
      "es",
    );
  });

  it("TUL-1187: unprefixed path: header is used when there is no cookie", () => {
    assert.equal(
      resolveRequestLocale({
        ...LOCALES,
        headerLocale: "en",
        pathname: "/directory",
        search: "",
        cookieLocale: null,
      }),
      "en",
    );
  });

  it("TUL-1187: prefixed path still beats the cookie", () => {
    assert.equal(
      resolveRequestLocale({
        ...LOCALES,
        headerLocale: "es",
        pathname: "/es/directory",
        search: "",
        cookieLocale: "en",
      }),
      "es",
    );
  });

  it("uses the header over the cookie when no pathname is known", () => {
    assert.equal(
      resolveRequestLocale({
        ...LOCALES,
        headerLocale: "en",
        pathname: null,
        search: "",
        cookieLocale: "es",
      }),
      "en",
    );
  });

  it("rejects an unsupported query locale", () => {
    assert.equal(
      resolveRequestLocale({
        ...LOCALES,
        headerLocale: "en",
        pathname: "/t/TAL-00031",
        search: "?lang=fr",
        cookieLocale: null,
      }),
      "en",
    );
  });
});
