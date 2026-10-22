/**
 * TUL-711: seeded header/footer menu rows read in the visitor's language; typed labels stay as written.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { localiseSeededCmsNavLabel } from "./seeded-nav-labels";

test("seeded Home / Contact follow the visitor language", () => {
  assert.equal(localiseSeededCmsNavLabel("Home", "/", "es"), "Inicio");
  assert.equal(localiseSeededCmsNavLabel("Home", "/", "es-MX"), "Inicio");
  assert.equal(localiseSeededCmsNavLabel("Inicio", "/", "en"), "Home");
  assert.equal(localiseSeededCmsNavLabel("Contact", "/contact", "es"), "Contacto");
  assert.equal(localiseSeededCmsNavLabel("Contacto", "/contact/", "en"), "Contact");
});

test("a label the owner typed, or a seeded word on another destination, is shown as written", () => {
  assert.equal(localiseSeededCmsNavLabel("Portada", "/", "es"), "Portada");
  assert.equal(localiseSeededCmsNavLabel("Get in touch", "/contact", "es"), "Get in touch");
  assert.equal(localiseSeededCmsNavLabel("Home", "/about", "es"), "Home");
  assert.equal(localiseSeededCmsNavLabel("Home", "/", "fr"), "Home");
  assert.equal(localiseSeededCmsNavLabel("Home", "/", null), "Home");
});

test("only rows that fell back from another locale are rewritten", () => {
  const src = readFileSync(new URL("./public-navigation.ts", import.meta.url), "utf8");
  assert.match(src, /fromLocale !== locale \? localiseSeededCmsNavLabel\(r\.label, r\.href, locale\) : r\.label/);
});
