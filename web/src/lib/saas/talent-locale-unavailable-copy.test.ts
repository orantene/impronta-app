import test from "node:test";
import assert from "node:assert/strict";

import { talentLocaleUnavailableCopy } from "./talent-locale-unavailable-copy";

const all = (c: ReturnType<typeof talentLocaleUnavailableCopy>) =>
  `${c.title}${c.heading}${c.body}${c.homeCta}${c.siteLine?.text ?? ""}`;

test("TUL-516 B1: /en on a Spanish-only site speaks English to the visitor who asked for it", () => {
  const c = talentLocaleUnavailableCopy({ requested: "en", site: "es" });
  assert.equal(c.lang, "en");
  assert.equal(c.heading, "This site is in Spanish only");
  assert.match(c.body, /no English version/);
  assert.equal(c.homeCta, "Go to homepage");
  assert.deepEqual(c.siteLine, { lang: "es", text: "Este sitio está solo en español." });
  assert.doesNotMatch(all(c), /\u2014|\u2013/);
});

test("TUL-516 B1: /es on an English-only site speaks Spanish and names English", () => {
  const c = talentLocaleUnavailableCopy({ requested: "es", site: "en" });
  assert.equal(c.lang, "es");
  assert.equal(c.heading, "Este sitio está solo en inglés");
  assert.match(c.body, /No hay una versión en español/);
  assert.equal(c.homeCta, "Ir al inicio");
  assert.deepEqual(c.siteLine, { lang: "en", text: "This site is in English only." });
  assert.doesNotMatch(all(c), /\u2014|\u2013/);
});

test("TUL-516 B1: an unknown request language falls back to English", () => {
  const c = talentLocaleUnavailableCopy({ requested: null, site: "es" });
  assert.equal(c.lang, "en");
  assert.equal(c.heading, "This site is in Spanish only");
});
