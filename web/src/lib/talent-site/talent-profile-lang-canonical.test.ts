import test from "node:test";
import assert from "node:assert/strict";

import {
  applyLangQuery,
  decideTalentProfileLocale,
  talentProfileAlternates,
  talentProfileCodeFromPathname,
} from "./talent-profile-locale";

/**
 * TUL-875. One decision (decideTalentProfileLocale) drives <html lang> (root
 * layout), the rendered messages, canonical and hreflang (generateMetadata).
 * The layout used the raw request locale, so an es-only talent hit with an
 * English cookie/default shipped lang=en over canonical /es/t/<code>.
 */
const ORIGIN = "https://tulala.digital";
const CODE = "TAL-93020";
const PATH = `/t/${CODE}`;
const URL_EN = `${ORIGIN}${PATH}`;
const URL_ES = `${ORIGIN}/es${PATH}`;

function head(requested: string | null, primary: string, supported: string[]) {
  const profile = decideTalentProfileLocale({ requested, primary, supported });
  const alt = talentProfileAlternates({ origin: ORIGIN, path: PATH, urlDefault: "en", profile });
  return { htmlLang: profile.locale, canonical: alt.canonical, languages: alt.languages };
}

/** canonical must live in the language the page renders. */
function canonicalLang(canonical: string | undefined): string {
  return canonical?.startsWith(`${ORIGIN}/es/`) ? "es" : "en";
}

test("cookie en, talent offers en+es: lang en, canonical unprefixed, hreflang es -> /es", () => {
  const h = head("en", "es", ["en", "es"]);
  assert.equal(h.htmlLang, "en");
  assert.equal(h.canonical, URL_EN);
  assert.equal(h.languages?.es, URL_ES);
  assert.equal(h.languages?.en, URL_EN);
});

test("cookie es, talent offers en+es: lang es, canonical /es/t/<code>", () => {
  const h = head("es", "en", ["en", "es"]);
  assert.equal(h.htmlLang, "es");
  assert.equal(h.canonical, URL_ES);
  assert.equal(h.languages?.en, URL_EN);
});

test("TAL-93020 shape: es-only talent with an English cookie renders es, so lang and canonical are both es", () => {
  const h = head("en", "es", ["es"]);
  assert.equal(h.htmlLang, "es");
  assert.equal(h.canonical, URL_ES);
  assert.equal(canonicalLang(h.canonical), h.htmlLang);
});

test("?lang= wins and lang stays equal to the canonical language", () => {
  const h = head(applyLangQuery("en", "es") ?? null, "en", ["en", "es"]);
  assert.equal(h.htmlLang, "es");
  assert.equal(h.canonical, URL_ES);
});

test("canonical never differs in language from <html lang> across the matrix (incl. no cookie)", () => {
  for (const requested of ["en", "es", "fr", null]) {
    for (const primary of ["en", "es"]) {
      for (const supported of [["en"], ["es"], ["en", "es"]]) {
        const h = head(requested, primary, supported);
        assert.equal(canonicalLang(h.canonical), h.htmlLang, `${requested}/${primary}/${supported}`);
      }
    }
  }
});

test("talentProfileCodeFromPathname: matches /t/<code> and /xx/t/<code> only", () => {
  assert.equal(talentProfileCodeFromPathname("/t/TAL-93020"), "TAL-93020");
  assert.equal(talentProfileCodeFromPathname("/es/t/TAL-93020/"), "TAL-93020");
  assert.equal(talentProfileCodeFromPathname("/t/TAL-93020/p/x"), null);
  assert.equal(talentProfileCodeFromPathname("/directory"), null);
  assert.equal(talentProfileCodeFromPathname(null), null);
});
