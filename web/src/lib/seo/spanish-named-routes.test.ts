import { test } from "node:test";
import assert from "node:assert/strict";

import {
  SPANISH_NAMED_MARKETING_PATHS,
  SPANISH_NAMED_MARKETING_PREFIXES,
  buildCrossSlugMarketingAlternates,
  buildSpanishOnlyMarketingAlternates,
  isSpanishNamedMarketingPath,
  pinnedMarketingLocale,
} from "./spanish-named-routes";

/**
 * Verified by rendering on 2026-08-21: `/agencia-de-talento` served the ENGLISH
 * page (title "A talent agency, reimagined") while `/es/agencia-de-talento`
 * served Spanish. Since the sitemap advertised both forms, the English copy was
 * crawlable at the Spanish-keyword URL — a searcher clicking the Spanish result
 * could land on English.
 */

test("matches the Spanish-named routes with or without a locale prefix", () => {
  for (const path of SPANISH_NAMED_MARKETING_PATHS) {
    assert.equal(isSpanishNamedMarketingPath(path), true, path);
    assert.equal(isSpanishNamedMarketingPath(`/es${path}`), true, `/es${path}`);
    assert.equal(isSpanishNamedMarketingPath(`${path}/`), true, `${path}/`);
  }
});

test("does not swallow neighbouring or nested routes", () => {
  // Only the landing pages themselves are Spanish-only. A child route or a
  // lookalike prefix must keep normal locale resolution.
  for (const path of [
    "/agencies",
    "/directory",
    "/websites",
    "/pricing",
    "/agencia-de-talento/algo",
    "/agencia-de-talento-falso",
    "/",
  ]) {
    assert.equal(isSpanishNamedMarketingPath(path), false, path);
  }
});

test("canonical is the /es/ form, not the bare path", () => {
  const { alternates } = buildSpanishOnlyMarketingAlternates("/agencia-de-talento");
  assert.equal(alternates?.canonical, "/es/agencia-de-talento");
});

test("never claims an English alternate for a page that has no English version", () => {
  // This is the whole point: the default marketing helper emits
  // `en: /agencia-de-talento`, which after the locale pin would promise search
  // engines an English document at a URL that serves Spanish.
  for (const path of SPANISH_NAMED_MARKETING_PATHS) {
    const { alternates } = buildSpanishOnlyMarketingAlternates(path);
    const languages = alternates?.languages ?? {};
    assert.equal(
      Object.prototype.hasOwnProperty.call(languages, "en"),
      false,
      `${path} must not advertise an en alternate`,
    );
    assert.equal(languages["es"], `/es${path}`);
    // x-default points at the Spanish document, not a non-existent English one.
    assert.equal(languages["x-default"], `/es${path}`);
  }
});

test("the route list stays in sync with the sitemap's Spanish-named handling", () => {
  // A new Spanish-named landing must be added HERE, or it silently reverts to
  // rendering English at its own URL and being indexed that way.
  assert.deepEqual(
    [...SPANISH_NAMED_MARKETING_PATHS].sort(),
    ["/agencia-de-talento", "/contratar-modelos", "/sitios-web"],
  );
});

test("pins es only on the marketing host, and only for these routes", () => {
  assert.equal(pinnedMarketingLocale("marketing", "/agencia-de-talento"), "es");
  assert.equal(pinnedMarketingLocale("marketing", "/es/contratar-modelos"), "es");

  // A different route on the marketing host resolves normally.
  assert.equal(pinnedMarketingLocale("marketing", "/pricing"), null);

  // And the pin must never leak onto tenant/app/talent hosts, where these
  // pathnames could mean something else entirely.
  for (const kind of ["tenant", "app", "hub", "talent", "custom"]) {
    assert.equal(
      pinnedMarketingLocale(kind, "/agencia-de-talento"),
      null,
      `${kind} host must not be pinned`,
    );
  }
});

test("a Spanish-slugged SUBTREE pins to Spanish, on a slash boundary", () => {
  assert.deepEqual([...SPANISH_NAMED_MARKETING_PREFIXES], ["/funciones", "/comparar"]);
  for (const p of [
    "/funciones",
    "/funciones/",
    "/funciones/citas-y-reservas",
    "/es/funciones",
    "/es/funciones/citas-y-reservas",
    "/comparar",
    "/comparar/",
    "/comparar/tulala-vs-booksy",
    "/es/comparar",
    "/es/comparar/tulala-vs-booksy",
  ]) {
    assert.equal(isSpanishNamedMarketingPath(p), true, `expected a pin for ${p}`);
  }
  // A neighbour that merely starts with the same letters must NOT pin, or an
  // unrelated future route would silently render in Spanish.
  for (const p of [
    "/funciones-falso",
    "/funcionesx",
    "/fun",
    "/features/appointments",
    "/compararx",
    "/comparar-falso",
    "/compare/tulala-vs-booksy",
  ]) {
    assert.equal(isSpanishNamedMarketingPath(p), false, `expected no pin for ${p}`);
  }
});

test("cross-slug pages claim only their own URL in each locale", () => {
  const pair = { enPath: "/features/appointments", esPath: "/funciones/citas-y-reservas" };

  const en = buildCrossSlugMarketingAlternates("en", pair);
  assert.equal(en.alternates?.canonical, "/features/appointments");

  const es = buildCrossSlugMarketingAlternates("es", pair);
  assert.equal(es.alternates?.canonical, "/es/funciones/citas-y-reservas");

  // Both sides advertise the same pair, and x-default is the English one
  // because an English version genuinely exists here (unlike the Spanish-only
  // landings, where x-default is Spanish).
  for (const built of [en, es]) {
    const languages = built.alternates?.languages as Record<string, string>;
    assert.equal(languages.en, "/features/appointments");
    assert.equal(languages.es, "/es/funciones/citas-y-reservas");
    assert.equal(languages["x-default"], "/features/appointments");
  }

  // The failure this guards: a Spanish page claiming the English URL as its
  // own canonical, which is how a page declares itself a duplicate.
  assert.notEqual(es.alternates?.canonical, en.alternates?.canonical);
});
