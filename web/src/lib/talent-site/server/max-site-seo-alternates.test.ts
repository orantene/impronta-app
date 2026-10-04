import test from "node:test";
import assert from "node:assert/strict";

import { shouldSuggestLocale } from "@/i18n/locale-suggestion";
import type { MaxSitePageRow, MaxSiteRow } from "@/lib/talent-site/resolve-max-site-core";
import { talentProfileSitemapEntries, talentSiteUrlSettings } from "@/lib/talent-site/talent-site-locale-routing";
import { buildMaxSiteSeo } from "./max-site-seo.server";
import { maxSiteSeoToMetadata } from "./site-metadata";

/**
 * PR 5 — talent site SEO in the talent's OWN languages: each language version
 * is self-canonical (primary unprefixed, secondary prefixed) with reciprocal
 * hreflang and x-default on the primary; one language emits no hreflang.
 */

const site = { siteSlug: "alba", logoUrl: null } as unknown as MaxSiteRow;
const page = {
  title: "Alba",
  metaTitle: null,
  metaDescription: null,
  ogTitle: null,
  ogDescription: null,
  ogImageUrl: null,
  canonicalUrl: "https://alba.example/custom",
  noindex: null,
  jsonLd: null,
} as unknown as MaxSitePageRow;
const ORIGIN = "https://alba.tulala.digital";
const BILINGUAL = { primary: "es", urlDefault: "es", supported: ["es", "en"] };

function seo(locale: string, locales = BILINGUAL) {
  return buildMaxSiteSeo({ site, page, identity: null, locale, noindex: false, canonicalOrigin: ORIGIN, canonicalPath: "/services", locales });
}

test("bilingual: reciprocal hreflang, x-default on the primary", () => {
  const es = seo("es");
  assert.deepEqual(es.alternates?.languages, {
    es: `${ORIGIN}/services`,
    en: `${ORIGIN}/en/services`,
    "x-default": `${ORIGIN}/services`,
  });
  assert.deepEqual(seo("en").alternates?.languages, es.alternates?.languages);
});

test("each language is self-canonical; an explicit canonical_url only binds the primary", () => {
  assert.equal(seo("es").canonical, "https://alba.example/custom");
  assert.equal(seo("en").canonical, `${ORIGIN}/en/services`);
  const meta = maxSiteSeoToMetadata(seo("en"));
  assert.equal(meta.alternates?.canonical, `${ORIGIN}/en/services`);
  assert.equal((meta.alternates?.languages as Record<string, string>)["x-default"], `${ORIGIN}/services`);
});

test("single language: no hreflang at all", () => {
  const one = seo("es", { primary: "es", urlDefault: "es", supported: ["es"] });
  assert.equal(one.alternates, undefined);
  assert.equal(maxSiteSeoToMetadata(one).alternates?.languages, undefined);
});

test("sitemap: one entry per talent language; single-language talents get one bare entry", () => {
  const d = new Date("2026-09-29T00:00:00Z");
  const two = talentProfileSitemapEntries({ origin: "https://tulala.digital", path: "/t/TAL-1", urlDefault: "en", locales: ["es", "en"], lastModified: d });
  assert.deepEqual(two.map((e) => e.url), ["https://tulala.digital/es/t/TAL-1", "https://tulala.digital/t/TAL-1"]);
  assert.equal(two[0]!.alternates?.languages.en, "https://tulala.digital/t/TAL-1");
  const one = talentProfileSitemapEntries({ origin: "https://tulala.digital", path: "/t/TAL-2", urlDefault: "en", locales: ["en"], lastModified: d });
  assert.equal(one.length, 1);
  assert.equal(one[0]!.alternates, undefined);
});

test("suggestion bar on a talent host offers only the talent's secondary", () => {
  const base = {
    currentLocale: "es",
    pathname: "/services",
    userAgent: "Mozilla/5.0",
    acceptLanguage: "en-US,en;q=0.9",
  };
  const bilingual = shouldSuggestLocale({ ...base, tenantSettings: talentSiteUrlSettings("es", ["es", "en"]), showLanguageSwitcher: true });
  assert.equal(bilingual.suggest, true);
  if (bilingual.suggest) assert.equal(bilingual.href, "/en/services");
  const solo = shouldSuggestLocale({ ...base, tenantSettings: talentSiteUrlSettings("es", ["es"]), showLanguageSwitcher: false });
  assert.equal(solo.suggest, false);
});
