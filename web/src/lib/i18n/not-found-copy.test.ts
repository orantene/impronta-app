import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { notFoundCopy, notFoundUnnamedSite } from "./not-found-copy";

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

test("TUL-697: an unnamed workspace says 'este sitio' / 'this site', never the word Studio", () => {
  assert.equal(notFoundUnnamedSite("es"), "este sitio");
  assert.equal(notFoundUnnamedSite("en"), "this site");
  assert.match(notFoundCopy("es", notFoundUnnamedSite("es")).body, /en este sitio\./);
  assert.match(notFoundCopy("en", notFoundUnnamedSite("en")).body, /on this site\./);
  const src = readFileSync("src/app/not-found.tsx", "utf8");
  assert.doesNotMatch(src, /: "Studio"/);
  assert.match(src, /resolveTenantBrand\(ctx\.tenantId\)/);
});

test("English 404 is unchanged", () => {
  const c = notFoundCopy("en", null);
  assert.equal(c.heading, "Page not found");
  assert.equal(c.secondary.label, "Sign in");
  assert.equal(notFoundCopy("en", "X").poweredBy, "Powered by Tulala");
});
