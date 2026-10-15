import assert from "node:assert/strict";
import test from "node:test";

import {
  counterpartSlug,
  fallbackLookupOrder,
  inPlaceSlugs,
  isWorkspacePathPrefix,
  missingPageRedirectPath,
  pickMetaRow,
  preferRequestedSlug,
  resolveMissingPage,
  ROLE_SLUG_PAIRS,
} from "./public-page-fallback";

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

// TUL-867: role links resolve IN PLACE (no forced locale prefix redirect).
test("inPlaceSlugs: role slugs match both spellings; unknown paths only themselves", () => {
  assert.deepEqual(inPlaceSlugs("services"), ["services", "servicios"]);
  assert.deepEqual(inPlaceSlugs("nosotros"), ["nosotros", "about"]);
  assert.deepEqual(inPlaceSlugs("nope"), ["nope"]);
});

test("preferRequestedSlug: exact slug wins, counterpart serves otherwise, empty stays empty (404)", () => {
  const both = [{ slug: "servicios", locale: "es" }, { slug: "services", locale: "es" }];
  assert.deepEqual(preferRequestedSlug(both, "services"), [{ slug: "services", locale: "es" }]);
  const only = [{ slug: "servicios", locale: "es" }];
  assert.deepEqual(preferRequestedSlug(only, "services"), only);
  assert.deepEqual(preferRequestedSlug([], "unknown"), []);
  assert.equal(preferRequestedSlug(null, "x"), null);
});

// TUL-867 / TUL-697: path-based workspace prefixes (`/w/<slug>`).

const esDefault = { defaultLocale: "es", publicLocales: ["es", "en"] };

test("isWorkspacePathPrefix: only /w/<slug>", () => {
  assert.equal(isWorkspacePathPrefix("/w/qa-paid-owner"), true);
  assert.equal(isWorkspacePathPrefix(""), false);
  assert.equal(isWorkspacePathPrefix("/w/x/en"), false);
  assert.equal(isWorkspacePathPrefix("/impronta"), false);
  assert.equal(isWorkspacePathPrefix(undefined), false);
});

test("missingPageRedirectPath is locale-first on a path-based prefix", () => {
  assert.equal(
    missingPageRedirectPath({ hit: { locale: "en", slug: "servicios" }, settings: esDefault, pathPrefix: "/w/qa-paid-owner" }),
    "/en/w/qa-paid-owner/servicios",
  );
  assert.equal(
    missingPageRedirectPath({ hit: { locale: "es", slug: "servicios" }, settings: esDefault, pathPrefix: "/w/qa-paid-owner" }),
    "/w/qa-paid-owner/servicios",
  );
  assert.equal(
    missingPageRedirectPath({ hit: { locale: "en", slug: "services" }, settings: esDefault }),
    "/en/services",
  );
});

test("fallbackLookupOrder widens to every supported locale only on /w/<slug>", () => {
  assert.deepEqual(fallbackLookupOrder(["es"], ["es", "en"], "/w/qa-paid-owner"), ["es", "en"]);
  assert.deepEqual(fallbackLookupOrder(["es", "en"], ["es", "en", "fr"], "/w/q-a"), ["es", "en", "fr"]);
  assert.deepEqual(fallbackLookupOrder(["es"], ["es", "en"], ""), ["es"]);
});

test("pickMetaRow: requested locale wins; alias and other-locale rows resolve in place; unknown is null", () => {
  const rows = [
    { locale: "en", slug: "servicios", title: "Services" },
    { locale: "en", slug: "nosotros", title: "About" },
  ];
  const order = ["es", "en"];
  assert.equal(pickMetaRow(rows, "en", "services", order)?.row.title, "Services");
  assert.equal(pickMetaRow(rows, "en", "about", order)?.row.title, "About");
  assert.equal(pickMetaRow(rows, "es", "about", ["es", "en"])?.row.title, "About");
  assert.equal(pickMetaRow(rows, "es", "about", ["es", "en"])?.inPlace, true);
  assert.equal(pickMetaRow(rows, "es", "about", ["es"]), null);
  assert.equal(pickMetaRow(rows, "es", "nope", order), null);
  const exact = [{ locale: "en", slug: "services", title: "S" }];
  assert.equal(pickMetaRow(exact, "en", "services", order)?.inPlace, false);
});
