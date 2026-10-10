import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import type { MaxSitePageRow, MaxSiteRow } from "@/lib/talent-site/resolve-max-site-core";
import { talentProfileSitemapEntries, talentSiteUrlSettings } from "@/lib/talent-site/talent-site-locale-routing";
import { talentHostSitemapPaths } from "@/lib/talent-site/talent-site-sitemap";
import { buildTalentLocalBusinessJsonLd, priceRangeOf, withLocalBusiness } from "@/lib/talent-site/talent-local-business-json-ld";
import { buildMaxSiteSeo } from "./max-site-seo.server";
import { maxSiteSeoToMetadata, ogLocaleTags } from "./site-metadata";

/**
 * TUL-98 + TUL-74: a talent site is addressed by the TALENT's primary locale
 * (primary at root, secondaries prefixed). Both orderings are covered.
 */

const site = { siteSlug: "qa", logoUrl: null } as unknown as MaxSiteRow;
const page = {
  title: "Inicio",
  titleI18n: { en: "Home" },
  metaTitle: null,
  metaTitleI18n: { es: "Uñas en Playa", en: "Nails in Playa" },
  metaDescription: null,
  metaDescriptionI18n: { es: "Manicura de lujo", en: "Luxury manicure" },
  ogTitle: null,
  ogDescription: null,
  ogImageUrl: null,
  canonicalUrl: null,
  noindex: null,
  jsonLd: null,
} as unknown as MaxSitePageRow;
const ORIGIN = "https://qa-fresh-studio.tulala.digital";

function seo(primary: string, secondary: string, locale: string) {
  const supported = [primary, secondary];
  return buildMaxSiteSeo({
    site,
    page,
    identity: null,
    locale,
    noindex: false,
    canonicalOrigin: ORIGIN,
    canonicalPath: "/",
    locales: { primary, urlDefault: talentSiteUrlSettings(primary, supported).defaultLocale, supported },
  });
}

for (const [primary, secondary, secondaryPath] of [
  ["es", "en", "/en"],
  ["en", "es", "/es"],
] as const) {
  test(`${primary}-primary: root canonical, hreflang hits 200 URLs, secondary self-canonical`, () => {
    const root = seo(primary, secondary, primary);
    const other = seo(primary, secondary, secondary);
    assert.equal(root.canonical, `${ORIGIN}/`);
    assert.equal(other.canonical, `${ORIGIN}${secondaryPath}`);
    const expected = {
      [primary]: `${ORIGIN}/`,
      [secondary]: `${ORIGIN}${secondaryPath}`,
      "x-default": `${ORIGIN}/`,
    };
    assert.deepEqual(root.alternates?.languages, expected);
    assert.deepEqual(other.alternates?.languages, expected);
    // Never a URL that redirects: the primary has no `/<primary>` alias in the set.
    for (const url of Object.values(root.alternates?.languages ?? {})) {
      assert.ok(!url.endsWith(`/${primary}`), `${url} would redirect`);
    }
    assert.equal(maxSiteSeoToMetadata(other).openGraph?.url, `${ORIGIN}${secondaryPath}`);
  });
}

test("secondary page uses its own title and description", () => {
  const en = seo("es", "en", "en");
  assert.equal(en.title, "Nails in Playa");
  assert.equal(en.description, "Luxury manicure");
  const es = seo("es", "en", "es");
  assert.equal(es.title, "Uñas en Playa");
  assert.equal(es.description, "Manicura de lujo");
});

test("TUL-534 / GRK-091: og:image falls back to /t/site/<slug>/opengraph-image when column null", () => {
  const out = seo("es", "en", "es");
  assert.ok(out.ogImageUrl, "ogImageUrl must be set");
  assert.match(out.ogImageUrl!, /\/t\/site\/qa\/opengraph-image$/);
  const meta = maxSiteSeoToMetadata(out);
  const og = meta.openGraph as { images?: Array<{ url?: string }> };
  assert.ok(Array.isArray(og.images) && og.images.length > 0);
  assert.equal(og.images![0]!.url, out.ogImageUrl);
});

test("sitemap: ES-primary lists / and /en with matching alternates, never /es", () => {
  const entries = talentProfileSitemapEntries({
    origin: ORIGIN,
    path: "/",
    urlDefault: "es",
    locales: ["es", "en"],
    lastModified: new Date("2026-10-07T00:00:00Z"),
  });
  assert.deepEqual(entries.map((e) => e.url), [`${ORIGIN}/`, `${ORIGIN}/en`]);
  for (const e of entries) {
    assert.deepEqual(e.alternates?.languages, { es: `${ORIGIN}/`, en: `${ORIGIN}/en`, "x-default": `${ORIGIN}/` });
  }
});

test("sitemap: a published site with no page rows still lists its home", () => {
  assert.deepEqual(talentHostSitemapPaths([]), ["/"]);
  assert.deepEqual(
    talentHostSitemapPaths([{ slug: "home", isHome: true, status: "published", sortOrder: 0, noindex: null }]),
    ["/"],
  );
});

test("wiring: host metadata uses the host-root grammar; host sitemap uses the talent primary", () => {
  const route = readFileSync(join(process.cwd(), "src/app/%5Ftalent-site/[[...pageSlug]]/page.tsx"), "utf8");
  const meta = route.slice(route.indexOf("export async function generateMetadata"), route.indexOf("export default async function"));
  assert.match(meta, /hrefMode: "host-root"/);
  const map = readFileSync(join(process.cwd(), "src/app/sitemap.ts"), "utf8");
  const host = map.slice(map.indexOf("talentHostSitemapPaths(pages)"));
  assert.match(host, /urlDefault: pair\.primary/);
});

test("og:locale tags: page language plus the other hreflang languages", () => {
  assert.deepEqual(ogLocaleTags("es", { es: "a", en: "b", "x-default": "a" }), { locale: "es_MX", alternateLocale: ["en_US"] });
  assert.deepEqual(ogLocaleTags("en", undefined), { locale: "en_US" });
  assert.deepEqual(ogLocaleTags(undefined, { es: "a" }), {});
  const md = maxSiteSeoToMetadata(seo("es", "en", "es"), { ogLocale: "es" });
  assert.equal(md.openGraph?.locale, "es_MX");
});

test("LocalBusiness: only entered data, services with stated prices", () => {
  const services = [
    { name: "Gel", amountCents: 45000, currency: "mxn", priceDisplay: "exact", durationMinutes: 60 },
    { name: "Acrilico", amountCents: 120000, currency: "MXN", priceDisplay: "from" },
    { name: "Custom", amountCents: null, currency: "MXN", priceDisplay: "quote" },
  ];
  assert.equal(buildTalentLocalBusinessJsonLd({ canonicalUrl: `${ORIGIN}/`, name: "Ana", services }), null, "no city, no business");
  const ld = buildTalentLocalBusinessJsonLd({
    canonicalUrl: `${ORIGIN}/`,
    name: "Ana",
    addressLocality: "Playa del Carmen",
    sameAs: ["https://instagram.com/ana", "javascript:alert(1)"],
    imageUrl: "https://img/x.jpg",
    inLanguage: "es",
    services,
  }) as Record<string, unknown>;
  assert.equal(ld["@type"], "LocalBusiness");
  assert.deepEqual(ld.sameAs, ["https://instagram.com/ana"]);
  assert.deepEqual(ld.address, { "@type": "PostalAddress", addressLocality: "Playa del Carmen" });
  assert.equal(ld.priceRange, "MXN 450-1,200");
  const catalog = ld.hasOfferCatalog as { itemListElement: Array<{ itemOffered: { "@type": string; name: string } }> };
  assert.deepEqual(catalog.itemListElement.map((o) => o.itemOffered["@type"]), ["Service", "Service", "Service"]);
  assert.equal(ld.geo, undefined);
  assert.equal(ld.openingHours, undefined);
});

test("priceRangeOf: mixed currencies or no stated price -> none", () => {
  assert.equal(priceRangeOf([{ name: "a", amountCents: 100, currency: "USD", priceDisplay: "exact" }, { name: "b", amountCents: 100, currency: "MXN", priceDisplay: "exact" }]), null);
  assert.equal(priceRangeOf([{ name: "a", priceDisplay: "quote" }]), null);
});

test("buildMaxSiteSeo emits ProfilePage + LocalBusiness in one @graph when a city exists", () => {
  const withCity = buildMaxSiteSeo({
    site, page, identity: null, locale: "es", noindex: false, canonicalOrigin: ORIGIN, canonicalPath: "/",
    addressLocality: "Tulum", sameAs: ["https://instagram.com/ana"],
    services: [{ name: "Gel", amountCents: 45000, currency: "MXN", priceDisplay: "exact" }],
  });
  const graph = (withCity.jsonLd as { "@graph": Array<{ "@type": string }> })["@graph"];
  assert.deepEqual(graph.map((n) => n["@type"]), ["ProfilePage", "LocalBusiness"]);
  const noCity = buildMaxSiteSeo({ site, page, identity: null, locale: "es", noindex: false, canonicalOrigin: ORIGIN, canonicalPath: "/" });
  assert.equal((noCity.jsonLd as { "@type": string })["@type"], "ProfilePage");
  assert.equal(withLocalBusiness(null, { "@type": "LocalBusiness" }), null);
});

test("policy pages: the home page's explicit canonical never applies; each page is self-canonical with an ES<->EN hreflang pair", () => {
  const homeWithExplicit = { ...page, canonicalUrl: `${ORIGIN}/` } as unknown as MaxSitePageRow;
  const supported = ["es", "en"];
  const build = (locale: string, path: string, ignore: boolean) =>
    buildMaxSiteSeo({
      site,
      page: homeWithExplicit,
      identity: null,
      locale,
      noindex: false,
      canonicalOrigin: ORIGIN,
      canonicalPath: path,
      ignoreExplicitCanonical: ignore,
      locales: { primary: "es", urlDefault: talentSiteUrlSettings("es", supported).defaultLocale, supported },
    });
  // Catches: /politicas declaring the HOME page as its canonical (the explicit canonical_url of the home row).
  const es = build("es", "/politicas", true);
  assert.equal(es.canonical, `${ORIGIN}/politicas`);
  assert.deepEqual(es.alternates?.languages, { es: `${ORIGIN}/politicas`, en: `${ORIGIN}/en/politicas`, "x-default": `${ORIGIN}/politicas` });
  const en = build("en", "/politicas", true);
  assert.equal(en.canonical, `${ORIGIN}/en/politicas`);
  assert.deepEqual(en.alternates?.languages, es.alternates?.languages);
  // The old behaviour (flag off) is what the bug was: the home canonical leaked onto the policy page.
  assert.equal(build("es", "/politicas", false).canonical, `${ORIGIN}/`);
});
