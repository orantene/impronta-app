/**
 * TUL-711: an English-seeded "Home" nav label renders as "Inicio" on an ES
 * visitor locale (and the reverse), only for the home link.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { isSeededHomeHref, localiseSeededHomeLabel } from "./seeded-home-label";

test("seeded Home becomes Inicio for ES and back for EN", () => {
  assert.equal(localiseSeededHomeLabel("Home", true, "es"), "Inicio");
  assert.equal(localiseSeededHomeLabel("Home", true, "es-MX"), "Inicio");
  assert.equal(localiseSeededHomeLabel("Inicio", true, "en"), "Home");
});

test("an owner-typed label or a non-home link is never rewritten", () => {
  assert.equal(localiseSeededHomeLabel("Portada", true, "es"), "Portada");
  assert.equal(localiseSeededHomeLabel("Home", false, "es"), "Home");
  assert.equal(localiseSeededHomeLabel("Home", true, null), "Home");
});

test("TUL-711: the home link is recognised under a tenant prefix, trailing slash, hash or seeded home page", () => {
  const home = "/w/qa-paid-owner";
  for (const h of ["/w/qa-paid-owner", "/w/qa-paid-owner/", "/w/qa-paid-owner#top", "/w/qa-paid-owner/home", "/w/qa-paid-owner/inicio", "/w/qa-paid-owner/es"]) {
    assert.equal(isSeededHomeHref(h, home), true, h);
  }
  for (const h of ["/w/qa-paid-owner/about", "/w/qa-paid-owner/home-care", "https://example.com/home", "/w/other"]) {
    assert.equal(isSeededHomeHref(h, home), false, h);
  }
  assert.equal(isSeededHomeHref("/", "/"), true);
  assert.equal(isSeededHomeHref("/home", "/"), true);
  assert.equal(isSeededHomeHref("/about", "/"), false);
});
