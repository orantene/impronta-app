import assert from "node:assert/strict";
import test from "node:test";

import { counterpartSlug, resolveMissingPage, ROLE_SLUG_PAIRS } from "./public-page-fallback";

// The live case (isolated fxlank, studio/both site): pages exist as Spanish
// slugs in locale "en"; the header links /services, /about, /gallery, /contact.
const rows = [
  { locale: "en", slug: "servicios" },
  { locale: "en", slug: "nosotros" },
  { locale: "en", slug: "galeria" },
  { locale: "en", slug: "contacto" },
  { locale: "en", slug: "agendar" },
  { locale: "en", slug: "" },
];

test("every English role link on a Spanish-slug site resolves to a page that exists", () => {
  for (const [en, es] of ROLE_SLUG_PAIRS) {
    if (en === "book") continue; // /book is its own route
    const hit = resolveMissingPage(rows, "es", en);
    assert.deepEqual(hit, { locale: "en", slug: es }, en);
  }
  assert.deepEqual(resolveMissingPage(rows, "es", "agendar"), { locale: "en", slug: "agendar" });
});

test("same locale beats another locale; counterpart slug beats nothing", () => {
  const both = [{ locale: "es", slug: "servicios" }, { locale: "en", slug: "services" }];
  assert.deepEqual(resolveMissingPage(both, "es", "services"), { locale: "es", slug: "servicios" });
  assert.deepEqual(resolveMissingPage(both, "en", "servicios"), { locale: "en", slug: "services" });
});

test("a page that does not exist anywhere stays a 404", () => {
  assert.equal(resolveMissingPage(rows, "es", "directory"), null);
  assert.equal(resolveMissingPage(rows, "es", "nope"), null);
  assert.equal(resolveMissingPage([], "es", "services"), null);
});

test("counterpartSlug is symmetric and null for non-role slugs", () => {
  for (const [en, es] of ROLE_SLUG_PAIRS) {
    assert.equal(counterpartSlug(en), es);
    assert.equal(counterpartSlug(es), en);
  }
  assert.equal(counterpartSlug("politicas"), null);
});
