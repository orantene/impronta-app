/**
 * TUL-711: an English-seeded "Home" nav label renders as "Inicio" on an ES
 * visitor locale (and the reverse), only for the home link.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { localiseSeededHomeLabel } from "./seeded-home-label";

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
