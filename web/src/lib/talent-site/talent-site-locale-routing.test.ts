import test from "node:test";
import assert from "node:assert/strict";

import {
  boundTalentSiteLocale,
  decideTalentSiteLocale,
  talentSiteLocalePath,
  talentSiteSwitcherHrefs,
  talentSiteUrlSettings,
} from "./talent-site-locale-routing";

/** Alba: Spanish primary, English secondary. */
const ALBA = { primary: "es", supported: ["es", "en"] as const };
/** A single-language talent (English only). */
const SOLO = { primary: "en", supported: ["en"] as const };

test("a fresh visitor gets the talent's primary on the unprefixed URL", () => {
  const d = decideTalentSiteLocale({ pathname: "/", ...ALBA });
  assert.deepEqual(d, { locale: "es", innerPath: "/", redirectPath: null, explicit: false });
});

test("a secondary prefix is an explicit choice and is stripped for the allow-list", () => {
  const d = decideTalentSiteLocale({ pathname: "/en/services", ...ALBA });
  assert.equal(d.locale, "en");
  assert.equal(d.innerPath, "/services");
  assert.equal(d.redirectPath, null);
  assert.equal(d.explicit, true);
  assert.equal(decideTalentSiteLocale({ pathname: "/en", ...ALBA }).innerPath, "/");
});

test("the primary prefix 302s to the unprefixed URL and remembers the choice", () => {
  const d = decideTalentSiteLocale({ pathname: "/es/services", ...ALBA });
  assert.equal(d.locale, "es");
  assert.equal(d.redirectPath, "/services");
  assert.equal(d.explicit, true);
});

test("?locale= inside the set redirects to the prefixed path", () => {
  assert.equal(decideTalentSiteLocale({ pathname: "/services", queryLocale: "en", ...ALBA }).redirectPath, "/en/services");
  assert.equal(decideTalentSiteLocale({ pathname: "/", queryLocale: "EN", ...ALBA }).redirectPath, "/en");
  assert.equal(decideTalentSiteLocale({ pathname: "/services", queryLocale: "es", ...ALBA }).redirectPath, "/services");
});

test("prefix beats query beats primary", () => {
  assert.equal(decideTalentSiteLocale({ pathname: "/en/x", queryLocale: "es", ...ALBA }).locale, "en");
  assert.equal(decideTalentSiteLocale({ pathname: "/x", queryLocale: "en", ...ALBA }).locale, "en");
});

test("TUL-363: a stale cookie can never flip an unprefixed URL off the primary", () => {
  // The resolver has no cookie input at all; even a cookie smuggled in is ignored.
  const smuggled = { cookieLocale: "en" };
  const d = decideTalentSiteLocale({ pathname: "/", ...smuggled, ...ALBA });
  assert.deepEqual(d, { locale: "es", innerPath: "/", redirectPath: null, explicit: false });
  assert.equal(decideTalentSiteLocale({ pathname: "/services", ...ALBA }).locale, "es");
  // /en keeps rendering English, and visiting it does not change what / renders.
  assert.equal(decideTalentSiteLocale({ pathname: "/en", ...ALBA }).locale, "en");
  assert.equal(decideTalentSiteLocale({ pathname: "/", ...ALBA }).locale, "es");
});

test("languages outside the talent's set are ignored everywhere", () => {
  const d = decideTalentSiteLocale({ pathname: "/es/x", queryLocale: "es", ...SOLO });
  // `/es/x` is not a locale prefix for an English-only talent: it is a page path.
  assert.deepEqual(d, { locale: "en", innerPath: "/es/x", redirectPath: null, explicit: false });
  assert.equal(decideTalentSiteLocale({ pathname: "/", queryLocale: "fr", ...ALBA }).redirectPath, null);
});

test("bounding a requested locale never leaves the talent's set", () => {
  assert.equal(boundTalentSiteLocale("en", "es", ["es", "en"]), "en");
  assert.equal(boundTalentSiteLocale("fr", "es", ["es", "en"]), "es");
  assert.equal(boundTalentSiteLocale(null, "es", ["es"]), "es");
});

test("switcher hrefs point at this page per language; none for one language", () => {
  const grammar = talentSiteUrlSettings("es", ["es", "en"]);
  assert.deepEqual(talentSiteSwitcherHrefs("/services", grammar, ["es", "en"]), { es: "/services?locale=es", en: "/en/services" });
  assert.deepEqual(talentSiteSwitcherHrefs("/", grammar, ["es", "en"]), { es: "/?locale=es", en: "/en" });
  assert.equal(talentSiteSwitcherHrefs("/", talentSiteUrlSettings("en", ["en"]), ["en"]), undefined);
  assert.equal(talentSiteLocalePath("/about", "en", "es", ["es", "en"]), "/en/about");
});

test("clicking the primary switcher link beats a stale cookie and is remembered", () => {
  const hrefs = talentSiteSwitcherHrefs("/", talentSiteUrlSettings("es", ["es", "en"]), ["es", "en"])!;
  const d = decideTalentSiteLocale({ pathname: "/", queryLocale: new URL(hrefs.es, "https://x.test").searchParams.get("locale"), ...ALBA });
  assert.equal(d.locale, "es");
  assert.equal(d.explicit, true);
  assert.equal(d.redirectPath, "/");
  // and a bare unprefixed visit renders the primary (the cookie is not an input)
  assert.equal(decideTalentSiteLocale({ pathname: "/", ...ALBA }).locale, "es");
});
