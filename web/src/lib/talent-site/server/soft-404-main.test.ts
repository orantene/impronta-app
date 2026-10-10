import assert from "node:assert/strict";
import { test } from "node:test";

import { soft404Copy } from "./soft-404-main";

test("soft404Copy: Spanish uses Volver al inicio", () => {
  const es = soft404Copy("es");
  assert.equal(es.homeCta, "Volver al inicio");
  assert.equal(es.heading, "Página no encontrada");
  assert.match(es.body, /no existe/);
  assert.doesNotMatch(es.body, /—/);
});

test("soft404Copy: English uses Back to home", () => {
  const en = soft404Copy("en");
  assert.equal(en.homeCta, "Back to home");
  assert.equal(en.heading, "Page not found");
  assert.match(en.body, /doesn't exist|does not exist|moved/i);
  assert.doesNotMatch(en.body, /—/);
});

test("soft404Copy: locale prefix es-* is Spanish", () => {
  assert.equal(soft404Copy("es-MX").homeCta, "Volver al inicio");
});
