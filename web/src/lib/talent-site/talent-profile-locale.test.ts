import test from "node:test";
import assert from "node:assert/strict";

import {
  decideTalentProfileLocale,
  ogLocale,
  pickByChain,
  talentProfileAlternates,
} from "./talent-profile-locale";

const ALBA = { primary: "es", supported: ["es", "en"] };
const SOLO_ES = { primary: "es", supported: ["es"] };
const ORIGIN = "https://app.tulala.digital";
const PATH = "/t/TAL-1";

test("a requested locale in the talent's set renders, chain falls back to primary", () => {
  const d = decideTalentProfileLocale({ requested: "en", ...ALBA });
  assert.equal(d.locale, "en");
  assert.deepEqual(d.chain, ["en", "es"]);
  assert.deepEqual(d.supported, ["es", "en"]);
});

test("a requested locale outside the set renders the talent's primary", () => {
  assert.equal(decideTalentProfileLocale({ requested: "en", ...SOLO_ES }).locale, "es");
  assert.equal(decideTalentProfileLocale({ requested: "fr", ...ALBA }).locale, "es");
  assert.equal(decideTalentProfileLocale({ requested: null, ...ALBA }).locale, "es");
  assert.deepEqual(decideTalentProfileLocale({ requested: "fr", ...ALBA }).chain, ["es"]);
});

test("primary is always first in the supported set", () => {
  const d = decideTalentProfileLocale({ requested: "es", primary: "es", supported: ["en", "es"] });
  assert.deepEqual(d.supported, ["es", "en"]);
});

test("single-language talent: self canonical, no hreflang", () => {
  const profile = decideTalentProfileLocale({ requested: "en", ...SOLO_ES });
  const alt = talentProfileAlternates({ origin: ORIGIN, path: PATH, urlDefault: "en", profile });
  assert.deepEqual(alt, { canonical: `${ORIGIN}/es/t/TAL-1` });
});

test("two-language talent: talent's languages only, self-canonical, x-default = primary", () => {
  const en = talentProfileAlternates({
    origin: ORIGIN,
    path: PATH,
    urlDefault: "en",
    profile: decideTalentProfileLocale({ requested: "en", ...ALBA }),
  });
  assert.equal(en.canonical, `${ORIGIN}/t/TAL-1`);
  assert.deepEqual(en.languages, {
    es: `${ORIGIN}/es/t/TAL-1`,
    en: `${ORIGIN}/t/TAL-1`,
    "x-default": `${ORIGIN}/es/t/TAL-1`,
  });
  const es = talentProfileAlternates({
    origin: ORIGIN,
    path: PATH,
    urlDefault: "en",
    profile: decideTalentProfileLocale({ requested: "es", ...ALBA }),
  });
  assert.equal(es.canonical, `${ORIGIN}/es/t/TAL-1`);
  assert.deepEqual(es.languages, en.languages);
});

test("a platform locale the talent does not speak is never advertised", () => {
  const alt = talentProfileAlternates({
    origin: ORIGIN,
    path: PATH,
    urlDefault: "en",
    profile: decideTalentProfileLocale({ requested: "en", primary: "en", supported: ["en", "fr"] }),
  });
  assert.deepEqual(Object.keys(alt.languages ?? {}).sort(), ["en", "fr", "x-default"]);
  assert.equal(alt.languages?.["x-default"], `${ORIGIN}/t/TAL-1`);
});

test("pickByChain walks the chain, then en, skipping blanks", () => {
  assert.equal(pickByChain({ en: "Model", es: "Modelo" }, ["es", "en"]), "Modelo");
  assert.equal(pickByChain({ en: "Model", es: "  " }, ["es"]), "Model");
  assert.equal(pickByChain({ fr: "Mannequin", es: "Modelo" }, ["fr", "es"]), "Mannequin");
  assert.equal(pickByChain(null, ["es"]), "");
});

test("ogLocale maps known codes and passes unknown through", () => {
  assert.equal(ogLocale("es"), "es_ES");
  assert.equal(ogLocale("xx"), "xx");
});
