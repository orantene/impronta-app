import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

import { talentNotFoundCopy, talentNotFoundLang } from "./talent-not-found-copy";

const APP = path.join(__dirname, "..", "..", "app");

test("GRK-028: Spanish talent 404 is Spanish and carries the site name", () => {
  const c = talentNotFoundCopy("es", "Diego Navarro");
  assert.equal(c.lang, "es");
  assert.equal(c.heading, "Página no encontrada");
  assert.equal(c.home, "Volver al inicio");
  assert.equal(c.eyebrow, "Diego Navarro");
  assert.equal(c.documentTitle, "Página no encontrada · Diego Navarro");
  assert.doesNotMatch(c.documentTitle, /Tulala/);
});

test("GRK-028: English talent 404 and nameless fallback", () => {
  const en = talentNotFoundCopy("en", "Alex Treviño");
  assert.equal(en.heading, "Page not found");
  assert.equal(en.documentTitle, "Page not found · Alex Treviño");
  const nameless = talentNotFoundCopy("es-MX", "  ");
  assert.equal(nameless.eyebrow, "Este sitio");
  assert.equal(nameless.documentTitle, "Página no encontrada");
  assert.equal(talentNotFoundLang(null), "en");
  assert.equal(talentNotFoundLang("ES"), "es");
});

test("GRK-028: one-word talent paths have a talent-branded not-found boundary", () => {
  const src = readFileSync(path.join(APP, "%5Ftalent-site", "not-found.tsx"), "utf8");
  assert.match(src, /TalentSiteNotFoundCard/);
  assert.match(src, /talentNotFoundCopy/);
  const page = readFileSync(path.join(APP, "%5Ftalent-site", "[[...pageSlug]]", "page.tsx"), "utf8");
  assert.doesNotMatch(page, /title: "Not found"/, "page metadata must not fall back to the English Tulala title");
  const proxy404 = readFileSync(path.join(APP, "%5Fpage-not-found", "page.tsx"), "utf8");
  assert.match(proxy404, /TalentSiteNotFoundCard/);
});
