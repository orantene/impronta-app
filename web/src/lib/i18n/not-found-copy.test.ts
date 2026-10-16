import assert from "node:assert/strict";
import test from "node:test";

import { notFoundCopy } from "./not-found-copy";

// Minor card: the Spanish 404 page was English.
test("Spanish 404 is fully Spanish for the platform", () => {
  const c = notFoundCopy("es", null);
  assert.equal(c.heading, "Página no encontrada");
  assert.equal(c.primary.label, "Ir al inicio");
  assert.equal(c.secondary.label, "Iniciar sesión");
  assert.doesNotMatch(JSON.stringify(c), /Page not found|Go home|Sign in/);
});

test("Spanish 404 names the agency in Spanish", () => {
  const c = notFoundCopy("es", "Casa Luz");
  assert.match(c.body, /Casa Luz/);
  assert.equal(c.primary.label, "Volver al inicio");
  assert.equal(c.poweredBy, "Con tecnología de Tulala");
});

test("English 404 is unchanged", () => {
  const c = notFoundCopy("en", null);
  assert.equal(c.heading, "Page not found");
  assert.equal(c.secondary.label, "Sign in");
  assert.equal(notFoundCopy("en", "X").poweredBy, "Powered by Tulala");
});
