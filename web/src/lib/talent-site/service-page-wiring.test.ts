import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { isTalentSiteHostPathAllowed } from "@/lib/saas/talent-site-host-routing";
import { talentProfileSitemapEntries } from "./talent-site-locale-routing";
import { serviceBookHref, serviceSitemapPaths, serviceSlug } from "./service-page";
import { serviceSeo } from "./server/service-main";
import { maxSiteSeoToMetadata } from "./server/site-metadata";

const A = {
  id: "3fa91c2b-1111-4222-8333-444455556666",
  kind: "service",
  title: "Corte de cabello",
  description: "Incluye lavado",
  priceDisplay: "from",
  amountCents: 30000,
  currency: "MXN",
  durationMinutes: 45,
  visibility: "public",
};

test("route resolution: a service slug renders on the talent host and is not reserved", () => {
  const r = isTalentSiteHostPathAllowed(`/${serviceSlug(A)}`);
  assert.deepEqual(r, { kind: "render", pageSlug: "servicio-corte-de-cabello-3fa91c2b" });
});

test("sitemap: each service is listed in both languages with reciprocal hreflang", () => {
  const entries = serviceSitemapPaths([A]).flatMap((path) =>
    talentProfileSitemapEntries({
      origin: "https://j.example",
      path,
      urlDefault: "es",
      locales: ["es", "en"],
      lastModified: new Date("2026-01-01"),
    }),
  );
  const urls = entries.map((e) => e.url).sort();
  assert.deepEqual(urls, [
    "https://j.example/en/servicio-corte-de-cabello-3fa91c2b",
    "https://j.example/servicio-corte-de-cabello-3fa91c2b",
  ]);
  const langs = entries[0].alternates?.languages as Record<string, string>;
  assert.equal(langs.es, "https://j.example/servicio-corte-de-cabello-3fa91c2b");
  assert.equal(langs.en, "https://j.example/en/servicio-corte-de-cabello-3fa91c2b");
});

test("metadata builder: title, description, canonical, hreflang kept, Service JSON-LD", () => {
  const alternates = {
    canonical: "https://j.example/en/servicio-corte-de-cabello-3fa91c2b",
    languages: {
      es: "https://j.example/servicio-corte-de-cabello-3fa91c2b",
      en: "https://j.example/en/servicio-corte-de-cabello-3fa91c2b",
    },
  };
  const seo = serviceSeo(
    { title: "Home", noindex: false, canonical: alternates.canonical, alternates },
    { ...A, imageUrls: ["https://x/y.jpg"] },
    { talentName: "Jorge", locale: "en" },
  );
  assert.equal(seo.title, "Corte de cabello | Jorge");
  assert.equal(seo.description, "Incluye lavado");
  assert.equal(seo.noindex, false);
  assert.equal(seo.canonical, alternates.canonical);
  assert.deepEqual(seo.alternates, alternates);
  assert.equal(seo.ogImageUrl, "https://x/y.jpg");
  const ld = seo.jsonLd as { "@type": string; url: string; inLanguage: string };
  assert.equal(ld["@type"], "Service");
  assert.equal(ld.url, alternates.canonical);
  assert.equal(ld.inLanguage, "en");
});

test("booking CTA targets the existing deep link for that service", () => {
  assert.equal(serviceBookHref(A.id, "/en"), `/en?book=${A.id}#book`);
});

test("wiring: renderer resolves service slugs and the host sitemap lists them", () => {
  const render = readFileSync(join(process.cwd(), "src/lib/talent-site/server/render-max-site.tsx"), "utf8");
  assert.match(render, /resolveServiceBySlug\(/);
  assert.match(render, /serviceSeo\(/);
  assert.match(render, /city: seoFacts\.addressLocality/);
  // The route's generateMetadata consumes result.seo (description + alternates) via the shared mapper.
  const route = readFileSync(join(process.cwd(), "src/app/%5Ftalent-site/[[...pageSlug]]/page.tsx"), "utf8");
  assert.match(route, /maxSiteSeoToMetadata\(result\.seo/);
  const sitemap = readFileSync(join(process.cwd(), "src/app/sitemap.ts"), "utf8");
  assert.match(sitemap, /serviceSitemapPaths\(/);
});

test("metadata mapping: service description is specific and per-locale canonical + hreflang survive", () => {
  const languages = {
    es: "https://j.example/servicio-gel-3fa91c2b",
    en: "https://j.example/en/servicio-gel-3fa91c2b",
    "x-default": "https://j.example/servicio-gel-3fa91c2b",
  };
  const seo = serviceSeo(
    { title: "Home", noindex: false, canonical: languages.en, alternates: { canonical: languages.en, languages } },
    { ...A, description: null },
    { talentName: "Ana", locale: "en", city: "Cancun" },
  );
  const md = maxSiteSeoToMetadata(seo, { ogLocale: "en" });
  assert.equal(md.description, "Corte de cabello by Ana in Cancun");
  assert.equal(md.alternates?.canonical, languages.en);
  assert.deepEqual(md.alternates?.languages, languages);
});

test("TUL-796: the article adds no bottom reserve of its own (body already reserves floating chrome)", () => {
  const src = readFileSync(join(process.cwd(), "src/lib/talent-site/server/service-main.tsx"), "utf8");
  assert.doesNotMatch(src, /padding: "48px 20px 1\d\d"/);
  assert.match(src, /padding: "48px 20px 56px"/);
});
