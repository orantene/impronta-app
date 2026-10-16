import test from "node:test";
import assert from "node:assert/strict";

import { buildLocaleAlternates } from "@/i18n/alternates";
import { serviceSlug, type ServicePageOffering } from "@/lib/talent-site/service-page";
import { buildServiceBreadcrumbNode, serviceHomeUrl } from "@/lib/talent-site/service-page-breadcrumb";
import { serviceSeo } from "@/lib/talent-site/server/service-main";
import { maxSiteJsonLdString, maxSiteSeoToMetadata } from "@/lib/talent-site/server/site-metadata";

/**
 * TUL-1085 (guard for TUL-586 and TUL-795). A talent service page emits, in lockstep:
 * a self-canonical per language, the reciprocal es/en hreflang pair (plus x-default),
 * and a BreadcrumbList (Home > Service) in the page JSON-LD next to the Service node.
 */

const ORIGIN = "https://j.example";
const OFFERING: ServicePageOffering = {
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
const PATH = `/${serviceSlug(OFFERING)}`;

/** The metadata a service page resolves to, for one language of a Spanish-primary talent. */
function pageFor(locale: "es" | "en") {
  const alt = buildLocaleAlternates({
    origin: ORIGIN,
    pathnameWithoutLocale: PATH,
    currentLocale: locale,
    defaultLocale: "es",
    supportedLocales: ["es", "en"],
  });
  const alternates = { canonical: alt.canonical, languages: alt.languages as Record<string, string> };
  const seo = serviceSeo(
    { title: "Home", noindex: false, canonical: alternates.canonical, alternates },
    OFFERING,
    { talentName: "Jorge", locale },
  );
  return { alternates, metadata: maxSiteSeoToMetadata(seo, { ogLocale: locale }), ld: JSON.parse(maxSiteJsonLdString(seo)) };
}

type GraphNode = Record<string, unknown> & { "@type": string };
const graphOf = (ld: { "@graph": GraphNode[] }) => ld["@graph"];

test("TUL-1085: each language page is its own canonical", () => {
  assert.equal(pageFor("es").metadata.alternates?.canonical, `${ORIGIN}${PATH}`);
  assert.equal(pageFor("en").metadata.alternates?.canonical, `${ORIGIN}/en${PATH}`);
});

test("TUL-1085: hreflang es + en are reciprocal and x-default is the primary language", () => {
  const expected = { es: `${ORIGIN}${PATH}`, en: `${ORIGIN}/en${PATH}`, "x-default": `${ORIGIN}${PATH}` };
  assert.deepEqual(pageFor("es").metadata.alternates?.languages, expected);
  assert.deepEqual(pageFor("en").metadata.alternates?.languages, expected);
});

test("TUL-1085: the JSON-LD graph has the Service and a BreadcrumbList", () => {
  const { ld } = pageFor("en");
  assert.equal(ld["@context"], "https://schema.org");
  assert.deepEqual(graphOf(ld).map((n) => n["@type"]), ["Service", "BreadcrumbList"]);
});

test("TUL-1085: the BreadcrumbList is Home > Service with absolute, position-numbered items", () => {
  const crumb = graphOf(pageFor("en").ld).find((n) => n["@type"] === "BreadcrumbList")!;
  assert.deepEqual(crumb.itemListElement, [
    { "@type": "ListItem", position: 1, name: "Home", item: `${ORIGIN}/en` },
    { "@type": "ListItem", position: 2, name: "Corte de cabello", item: `${ORIGIN}/en${PATH}` },
  ]);
  const es = graphOf(pageFor("es").ld).find((n) => n["@type"] === "BreadcrumbList")!;
  assert.deepEqual(es.itemListElement, [
    { "@type": "ListItem", position: 1, name: "Inicio", item: `${ORIGIN}/` },
    { "@type": "ListItem", position: 2, name: "Corte de cabello", item: `${ORIGIN}${PATH}` },
  ]);
});

test("TUL-1085: the last crumb is the canonical, and every graph node id is unique", () => {
  const { ld, alternates } = pageFor("es");
  const crumb = graphOf(ld).find((n) => n["@type"] === "BreadcrumbList")!;
  const items = crumb.itemListElement as { item: string }[];
  assert.equal(items.at(-1)!.item, alternates.canonical);
  const ids = graphOf(ld).map((n) => n["@id"]).filter(Boolean);
  assert.equal(new Set(ids).size, ids.length);
});

test("TUL-1085: the helper degrades to null on a canonical that is not an absolute URL", () => {
  assert.equal(serviceHomeUrl("/en/servicio-x-3fa91c2b"), null);
  assert.equal(buildServiceBreadcrumbNode({ canonicalUrl: "not a url", title: "X", locale: "en" }), null);
  assert.equal(buildServiceBreadcrumbNode({ canonicalUrl: `${ORIGIN}${PATH}`, title: "  ", locale: "en" }), null);
});

test("TUL-1085: no canonical means no JSON-LD at all (nothing half-built is emitted)", () => {
  const seo = serviceSeo({ title: "Home", noindex: false }, OFFERING, { talentName: "Jorge", locale: "en" });
  assert.equal(seo.jsonLd, undefined);
  assert.equal(maxSiteJsonLdString(seo), "");
});
