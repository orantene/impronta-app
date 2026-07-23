/**
 * Regression: marketing nav hrefs must carry the active locale.
 *
 * Before this helper the header hardcoded English paths, so on `/es` every nav
 * link ("Precios" -> `/pricing`, "Historias" -> `/#stories`) dropped the
 * visitor back into the English tree. hreflang advertised `/es`, but internal
 * linking funnelled both users and crawlers away from it.
 *
 * The hash case is the subtle one: `withLocalePath` takes a bare pathname, so
 * feeding it `/#stories` treats "#stories" as a path segment and produces
 * `/es/#stories`.
 */
import assert from "node:assert/strict";
import test from "node:test";

import { withLocaleHref } from "@/i18n/pathnames";
import { FALLBACK_LANGUAGE_SETTINGS } from "@/lib/language-settings/fetch-language-settings";

const S = FALLBACK_LANGUAGE_SETTINGS;
const es = (href: string) => withLocaleHref(href, "es", S);
const en = (href: string) => withLocaleHref(href, S.defaultLocale, S);

test("prefixes plain paths for a non-default locale", () => {
  assert.equal(es("/pricing"), "/es/pricing");
  assert.equal(es("/how-it-works"), "/es/how-it-works");
  assert.equal(es("/get-started"), "/es/get-started");
});

test("homepage becomes the locale root, not a trailing slash", () => {
  assert.equal(es("/"), "/es");
});

test("hash is applied to the path only", () => {
  // The bug this helper exists for: `/es/#stories` would be wrong.
  assert.equal(es("/#stories"), "/es#stories");
  assert.equal(es("/#builder"), "/es#builder");
  assert.equal(es("/pricing#plans"), "/es/pricing#plans");
});

test("query strings survive, and combine with a hash", () => {
  assert.equal(es("/directory?view=map"), "/es/directory?view=map");
  assert.equal(es("/directory?view=map#results"), "/es/directory?view=map#results");
});

test("the default locale is left unprefixed", () => {
  assert.equal(en("/pricing"), "/pricing");
  assert.equal(en("/#stories"), "/#stories");
  assert.equal(en("/"), "/");
});

test("already-prefixed hrefs are not double-prefixed", () => {
  assert.equal(es("/es/pricing"), "/es/pricing");
  assert.equal(en("/es/pricing"), "/pricing");
});

test("non-internal hrefs are returned untouched", () => {
  for (const href of [
    "https://example.com/x",
    "//cdn.example.com/x",
    "mailto:hola@tulala.digital",
    "tel:+15551234567",
    "#anchor-only",
  ]) {
    assert.equal(es(href), href, href);
  }
});
