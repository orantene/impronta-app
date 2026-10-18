import assert from "node:assert/strict";
import { test } from "node:test";

import { localeUrlSettings, stripDefaultLocalePrefixFromPath, withLocaleHref } from "@/i18n/pathnames";
import { missingPageRedirectPath } from "@/lib/site-admin/server/public-page-fallback";

// TUL-1086: /es/w/<slug> must stay Spanish through every redirect the proxy can issue.
// The proxy's only /es-removing redirect is stripDefaultLocalePrefixFromPath, which strips the
// DEFAULT locale only. So on an English-default grammar /es/w/* is untouched, and on a
// Spanish-default workspace (qa-paid-owner is one) /es/w/* collapses to the unprefixed URL,
// which IS the Spanish page (default locale is served unprefixed), never an English one.

const enDefault = localeUrlSettings("en", ["en", "es"]);
const esDefault = localeUrlSettings("es", ["es", "en"]);

test("English-default grammar: /es/w/<slug>/... is never stripped", () => {
  for (const p of ["/es/w/qa-paid-owner", "/es/w/qa-paid-owner/servicios", "/es/w/qa-paid-owner/contacto?x=1#top"]) {
    assert.equal(stripDefaultLocalePrefixFromPath(p, enDefault), p);
  }
});

test("Spanish-default workspace: the strip lands on the unprefixed Spanish page, and /en keeps English", () => {
  assert.equal(stripDefaultLocalePrefixFromPath("/es/w/qa-paid-owner/servicios", esDefault), "/w/qa-paid-owner/servicios");
  assert.equal(stripDefaultLocalePrefixFromPath("/en/w/qa-paid-owner/services", esDefault), "/en/w/qa-paid-owner/services");
  // and the link builder agrees: Spanish is unprefixed there, English carries /en
  assert.equal(withLocaleHref("/w/qa-paid-owner/servicios", "es", esDefault), "/w/qa-paid-owner/servicios");
  assert.equal(withLocaleHref("/w/qa-paid-owner/services", "en", esDefault), "/en/w/qa-paid-owner/services");
});

test("page-alias redirects put the locale BEFORE /w/<slug> and keep the page's own locale", () => {
  const pathPrefix = "/w/qa-paid-owner";
  assert.equal(
    missingPageRedirectPath({ hit: { locale: "es", slug: "servicios" }, settings: enDefault, pathPrefix }),
    "/es/w/qa-paid-owner/servicios",
  );
  assert.equal(
    missingPageRedirectPath({ hit: { locale: "en", slug: "services" }, settings: enDefault, pathPrefix }),
    "/w/qa-paid-owner/services",
  );
  assert.equal(
    missingPageRedirectPath({ hit: { locale: "es", slug: "servicios" }, settings: esDefault, pathPrefix }),
    "/w/qa-paid-owner/servicios",
  );
});
