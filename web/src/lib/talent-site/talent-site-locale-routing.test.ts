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

test("prefix beats query beats cookie beats primary", () => {
  assert.equal(decideTalentSiteLocale({ pathname: "/en/x", queryLocale: "es", cookieLocale: "es", ...ALBA }).locale, "en");
  assert.equal(decideTalentSiteLocale({ pathname: "/x", queryLocale: "en", cookieLocale: "es", ...ALBA }).locale, "en");
  const byCookie = decideTalentSiteLocale({ pathname: "/x", cookieLocale: "en", ...ALBA });
  assert.equal(byCookie.locale, "en");
  assert.equal(byCookie.explicit, false);
  assert.equal(byCookie.redirectPath, null);
});

test("languages outside the talent's set are ignored for query and cookie", () => {
  assert.equal(decideTalentSiteLocale({ pathname: "/", queryLocale: "fr", ...ALBA }).redirectPath, null);
  assert.equal(decideTalentSiteLocale({ pathname: "/", cookieLocale: "fr", ...ALBA }).locale, "es");
});

test("a platform locale the talent does not publish is a branded 404, not a page slug (TUL-488)", () => {
  const d = decideTalentSiteLocale({
    pathname: "/es/x",
    queryLocale: "es",
    cookieLocale: "es",
    platformLocales: ["en", "es"],
    ...SOLO,
  });
  assert.equal(d.locale, "es");
  assert.equal(d.innerPath, "/x");
  assert.equal(d.redirectPath, null);
  assert.equal(d.explicit, false);
  assert.equal(d.unsupportedPrefix, true);
  // Without platformLocales, legacy behavior keeps the segment as a page path.
  assert.deepEqual(
    decideTalentSiteLocale({ pathname: "/es/x", ...SOLO }),
    { locale: "en", innerPath: "/es/x", redirectPath: null, explicit: false },
  );
  const enOnly = decideTalentSiteLocale({
    pathname: "/en",
    platformLocales: ["en", "es"],
    primary: "es",
    supported: ["es"],
  });
  assert.equal(enOnly.unsupportedPrefix, true);
  assert.equal(enOnly.locale, "en");
  assert.equal(enOnly.innerPath, "/");
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
  const d = decideTalentSiteLocale({ pathname: "/", queryLocale: new URL(hrefs.es, "https://x.test").searchParams.get("locale"), cookieLocale: "en", ...ALBA });
  assert.equal(d.locale, "es");
  assert.equal(d.explicit, true);
  assert.equal(d.redirectPath, "/");
  // and a bare unprefixed visit still honours the cookie
  assert.equal(decideTalentSiteLocale({ pathname: "/", cookieLocale: "en", ...ALBA }).locale, "en");
});
