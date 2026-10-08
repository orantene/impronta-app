import assert from "node:assert/strict";
import { test } from "node:test";

import type { MaxSitePageRow, MaxSiteRow } from "@/lib/talent-site/resolve-max-site-core";
import { buildMaxSiteSeo } from "./server/max-site-seo.server";
import { seoTitleFallback } from "./seo-title-fallback";

const base = { locale: "en", primaryLocale: "es", name: "Jorg Beauty", city: "Playa del Carmen" } as const;

test("fallback: a visitor language with no written title gets name and city, never her words", () => {
  assert.equal(seoTitleFallback(base), "Jorg Beauty · Playa del Carmen");
  assert.equal(seoTitleFallback({ ...base, city: null }), "Jorg Beauty");
  assert.equal(seoTitleFallback({ ...base, city: "  " }), "Jorg Beauty");
});

test("no fallback: primary language, her own i18n title, one language, or no name", () => {
  assert.equal(seoTitleFallback({ ...base, locale: "es" }), null);
  assert.equal(seoTitleFallback({ ...base, metaTitleI18n: { en: "Jorg Beauty · Lashes in Playa del Carmen" } }), null);
  assert.equal(seoTitleFallback({ ...base, titleI18n: { en: "Home" } }), null);
  assert.equal(seoTitleFallback({ ...base, primaryLocale: null }), null);
  assert.equal(seoTitleFallback({ ...base, name: " " }), null);
  assert.equal(seoTitleFallback({ ...base, locale: "EN-us" }), "Jorg Beauty · Playa del Carmen");
});

const site = { siteSlug: "book-jorgelina", logoUrl: null } as unknown as MaxSiteRow;
const page = (extra: Record<string, unknown> = {}) =>
  ({ id: "p1", title: "Inicio", metaTitle: "Jorg Beauty · Pestañas, uñas y cejas en Playa del Carmen", metaTitleI18n: null, titleI18n: null, metaDescription: null, ogTitle: null, ogDescription: null, ogImageUrl: null, canonicalUrl: null, noindex: null, jsonLd: null, ...extra }) as unknown as MaxSitePageRow;
const LOCALES = { primary: "es", urlDefault: "es", supported: ["es", "en"] };
const seo = (locale: string, p: MaxSitePageRow) =>
  buildMaxSiteSeo({ site, page: p, identity: { name: "Jorg Beauty" } as never, locale, noindex: false, canonicalOrigin: "https://book-jorgelina.tulala.digital", canonicalPath: "/", locales: LOCALES, addressLocality: "Playa del Carmen" });

test("book-jorgelina shape: /en title is the generated one, /es keeps her text, her en title wins when written", () => {
  assert.equal(seo("en", page()).title, "Jorg Beauty · Playa del Carmen");
  assert.equal(seo("es", page()).title, "Jorg Beauty · Pestañas, uñas y cejas en Playa del Carmen");
  assert.equal(seo("en", page({ metaTitleI18n: { en: "Jorg Beauty · Lashes, nails and brows in Playa del Carmen" } })).title, "Jorg Beauty · Lashes, nails and brows in Playa del Carmen");
});

test("a one-language site is untouched (no locales given)", () => {
  const out = buildMaxSiteSeo({ site, page: page(), identity: { name: "Jorg Beauty" } as never, locale: "en", noindex: false });
  assert.equal(out.title, "Jorg Beauty · Pestañas, uñas y cejas en Playa del Carmen");
});
