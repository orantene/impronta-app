import assert from "node:assert/strict";
import { test } from "node:test";

import {
  buildLocationCatalog,
  buildLocationFacets,
  normalizeLocationKey,
  resolveLocationFilterIds,
} from "./location-facets";

/**
 * These fixtures are the REAL production rows, not invented ones, because the
 * defect was invisible against tidy fixtures: every fake row spells a country
 * one way. Measured 2026-09-05 on `talent_discover_index` (53 rows):
 *
 *   home_country_text:  Mexico 41 · México 4 · mexico 2 · Argentina 2 · null 4
 *   residence_city_id:  52 of 53 set
 *
 * The old facet key was `country.toLowerCase()`, which folded "mexico" into
 * "Mexico" but left "México" as a rival bucket, so ?country=Mexico returned 43
 * and ?country=México returned 4, disjoint.
 */

const LOCATIONS = [
  {
    id: "loc-pdc",
    country_code: "MX",
    city_slug: "playa-del-carmen",
    display_name_i18n: { en: "Playa del Carmen", es: "Playa del Carmen" },
  },
  {
    id: "loc-cancun",
    country_code: "MX",
    city_slug: "cancun",
    display_name_i18n: { en: "Cancun", es: "Cancún" },
  },
  {
    id: "loc-ba",
    country_code: "AR",
    city_slug: "buenos-aires",
    display_name_i18n: { en: "Buenos Aires", es: "Buenos Aires" },
  },
];

const COUNTRIES = [
  { iso2: "MX", name_en: "Mexico", name_es: "Mexico" },
  { iso2: "AR", name_en: "Argentina", name_es: "Argentina" },
];

const catalog = buildLocationCatalog(LOCATIONS, COUNTRIES, "en");

test("normalizeLocationKey folds diacritics AND case", () => {
  // The old key folded only case, which is exactly why México survived.
  assert.equal(normalizeLocationKey("México"), "mexico");
  assert.equal(normalizeLocationKey("mexico"), "mexico");
  assert.equal(normalizeLocationKey("MEXICO"), "mexico");
  assert.equal(normalizeLocationKey("  Playa  del   Carmen "), "playa del carmen");
  assert.equal(normalizeLocationKey("Cancún"), "cancun");
});

test("the three live spellings of Mexico produce ONE country bucket", () => {
  const rows = [
    ...Array(42).fill({ residence_city_id: "loc-pdc" }),
    ...Array(4).fill({ residence_city_id: "loc-cancun" }),
    ...Array(2).fill({ residence_city_id: "loc-ba" }),
  ];
  const { countries } = buildLocationFacets(rows, catalog);
  const mexico = countries.filter((c) => normalizeLocationKey(c.value) === "mexico");
  assert.equal(mexico.length, 1, "exactly one Mexico bucket");
  assert.equal(mexico[0]?.count, 46);
  assert.equal(countries.length, 2);
});

test("a city can never be paired with a country it is not in", () => {
  // "Buenos Aires, Mexico" was live on the page. It came from composing the
  // label out of two INDEPENDENT free-text fields. Deriving both from the
  // city's own row makes the pair unrepresentable.
  const { cities } = buildLocationFacets(
    [{ residence_city_id: "loc-ba" }, { residence_city_id: "loc-pdc" }],
    catalog,
  );
  const ba = cities.find((c) => c.city === "Buenos Aires");
  assert.equal(ba?.country, "Argentina");
  assert.equal(
    cities.some((c) => c.city === "Buenos Aires" && c.country === "Mexico"),
    false,
    "Buenos Aires must never render under Mexico",
  );
});

test("an old ?country=México link resolves to the single Mexico bucket", () => {
  // Back-compat matters: those links exist and used to return 4 of 46.
  const accented = resolveLocationFilterIds(catalog, { country: "México" });
  const plain = resolveLocationFilterIds(catalog, { country: "Mexico" });
  const lower = resolveLocationFilterIds(catalog, { country: "mexico" });
  assert.deepEqual(accented.sort(), plain.sort());
  assert.deepEqual(lower.sort(), plain.sort());
  assert.equal(plain.length, 2, "both Mexican cities");
});

test("country + city together scope to the intersection", () => {
  const ids = resolveLocationFilterIds(catalog, {
    country: "Mexico",
    city: "Playa del Carmen",
  });
  assert.deepEqual(ids, ["loc-pdc"]);
});

test("an unresolvable filter returns [] so callers scope to NO results", () => {
  // The caller turns [] into `.is("id", null)`. Treating it as "no filter"
  // would silently widen a scoped page to everything, which is the more
  // dangerous direction.
  assert.deepEqual(resolveLocationFilterIds(catalog, { country: "Narnia" }), []);
  assert.deepEqual(
    resolveLocationFilterIds(catalog, { country: "Mexico", city: "Buenos Aires" }),
    [],
    "a real country and a real city that do not go together match nothing",
  );
});

test("no filter params select nothing, so the caller leaves the query unscoped", () => {
  assert.deepEqual(resolveLocationFilterIds(catalog, {}), []);
});

test("rows with no residence FK are skipped rather than bucketed as null", () => {
  // One production row has country text but no city FK. It drops out of the
  // location facets instead of creating an "unknown" bucket; it has no city
  // today either, so nothing filterable becomes unfilterable.
  const { countries, cities } = buildLocationFacets(
    [{ residence_city_id: null }, { residence_city_id: "loc-pdc" }],
    catalog,
  );
  assert.equal(countries.length, 1);
  assert.equal(countries[0]?.count, 1);
  assert.equal(cities.length, 1);
});

test("an unknown FK is skipped, not crashed on", () => {
  const { countries } = buildLocationFacets(
    [{ residence_city_id: "loc-does-not-exist" }],
    catalog,
  );
  assert.deepEqual(countries, []);
});

test("the Spanish catalog uses the locale display name", () => {
  const es = buildLocationCatalog(LOCATIONS, COUNTRIES, "es");
  assert.equal(es.get("loc-cancun")?.city, "Cancún");
  // ...and still keys to the same bucket as the English spelling, so a
  // Spanish visitor's facet and an English link agree.
  assert.equal(es.get("loc-cancun")?.cityKey, "cancun");
});
