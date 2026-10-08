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
  const d = decideTalentSiteLocale({ pathname: "/en/services", cookieLocale: "es", ...ALBA });
  assert.equal(d.locale, "en");
  assert.equal(d.innerPath, "/services");
  assert.equal(d.redirectPath, null);
  assert.equal(d.explicit, true);
  assert.equal(decideTalentSiteLocale({ pathname: "/en", ...ALBA }).innerPath, "/");
});

test("the primary prefix 302s to the unprefixed URL and remembers the choice", () => {
  const d = decideTalentSiteLocale({ pathname: "/es/services", cookieLocale: "en", ...ALBA });
  assert.equal(d.locale, "es");
  assert.equal(d.redirectPath, "/services");
  assert.equal(d.explicit, true);
});

test("?locale= inside the set redirects to the prefixed path", () => {
  assert.equal(decideTalentSiteLocale({ pathname: "/services", queryLocale: "en", ...ALBA }).redirectPath, "/en/services");
  assert.equal(decideTalentSiteLocale({ pathname: "/", queryLocale: "EN", ...ALBA }).redirectPath, "/en");
  assert.equal(decideTalentSiteLocale({ pathname: "/services", queryLocale: "es", ...ALBA }).redirectPath, "/services");
});

test("prefix beats query beats primary; cookie never overrides the path (TUL-363)", () => {
  assert.equal(decideTalentSiteLocale({ pathname: "/en/x", queryLocale: "es", cookieLocale: "es", ...ALBA }).locale, "en");
  assert.equal(decideTalentSiteLocale({ pathname: "/x", queryLocale: "en", cookieLocale: "es", ...ALBA }).locale, "en");
  // After /en left cookie=en, bare /x still serves primary (path-is-truth).
  const byPath = decideTalentSiteLocale({ pathname: "/x", cookieLocale: "en", ...ALBA });
  assert.equal(byPath.locale, "es");
  assert.equal(byPath.explicit, false);
  assert.equal(byPath.redirectPath, null);
});

test("languages outside the talent's set are ignored everywhere", () => {
  const d = decideTalentSiteLocale({ pathname: "/es/x", queryLocale: "es", cookieLocale: "es", ...SOLO });
  // `/es/x` is not a locale prefix for an English-only talent: it is a page path.
  assert.deepEqual(d, { locale: "en", innerPath: "/es/x", redirectPath: null, explicit: false });
  assert.equal(decideTalentSiteLocale({ pathname: "/", queryLocale: "fr", ...ALBA }).redirectPath, null);
  assert.equal(decideTalentSiteLocale({ pathname: "/", cookieLocale: "fr", ...ALBA }).locale, "es");
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

test("clicking the primary switcher link rewrites preference; bare / is already primary (TUL-363)", () => {
  const hrefs = talentSiteSwitcherHrefs("/", talentSiteUrlSettings("es", ["es", "en"]), ["es", "en"])!;
  const d = decideTalentSiteLocale({ pathname: "/", queryLocale: new URL(hrefs.es, "https://x.test").searchParams.get("locale"), cookieLocale: "en", ...ALBA });
  assert.equal(d.locale, "es");
  assert.equal(d.explicit, true);
  assert.equal(d.redirectPath, "/");
  // Path-is-truth: after /en stamped cookie=en, plain / still serves primary.
  assert.equal(decideTalentSiteLocale({ pathname: "/", cookieLocale: "en", ...ALBA }).locale, "es");
});

test("TUL-363: /en then unprefixed / serves primary despite locale=en cookie", () => {
  const afterEn = decideTalentSiteLocale({ pathname: "/en", ...ALBA });
  assert.equal(afterEn.locale, "en");
  assert.equal(afterEn.explicit, true);
  const plainHome = decideTalentSiteLocale({ pathname: "/", cookieLocale: "en", ...ALBA });
  assert.equal(plainHome.locale, "es");
  assert.equal(plainHome.explicit, false);
  const plainInner = decideTalentSiteLocale({ pathname: "/services", cookieLocale: "en", ...ALBA });
  assert.equal(plainInner.locale, "es");
});
