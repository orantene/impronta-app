import assert from "node:assert/strict";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import { createBuilderNode } from "@/lib/site-admin/builder-node/create";
import { renderBuilderNodes, type BuilderNodeRenderDataSources } from "@/lib/site-admin/builder-node/render";
import type { BuilderNode } from "@/lib/site-admin/builder-node/types";
import type { TalentOffering } from "@/lib/talent/offerings-types";
import { serviceSlug } from "@/lib/talent-site/service-page";
import { talentSiteLocalePath } from "@/lib/talent-site/talent-site-locale-routing";

/**
 * TUL-1087 (guard for TUL-792). Every card of the home services block links to its own
 * service page, in the visitor's language, as a crawlable `<a href>`. Before TUL-792 the
 * pages were only reachable through sitemap.xml.
 */

function render(dataSources: BuilderNodeRenderDataSources): string {
  const base = createBuilderNode("services_catalog");
  const node = { ...base, id: "cat-1", props: { ...base.props } } as BuilderNode;
  return renderToStaticMarkup(
    renderBuilderNodes([node], {
      mode: "freeform",
      includeRendererStyles: false,
      includeFontLinks: false,
      dataSources,
    }) as Parameters<typeof renderToStaticMarkup>[0],
  );
}

function offering(partial: Partial<TalentOffering>): TalentOffering {
  return {
    id: "off-1",
    talentProfileId: "talent-1",
    ownerKind: "talent",
    tenantId: null,
    kind: "service",
    title: "Gel pedicure",
    description: null,
    priceType: "flat_package",
    priceDisplay: "exact",
    amountCents: 30000,
    currency: "MXN",
    bookingMode: "instant",
    reserveMode: "deposit",
    depositPct: 25,
    allowPayInPerson: true,
    requireAccountToBook: false,
    requiresIdentity: false,
    identityReason: null,
    cancellationHours: 24,
    freeReserveExpiresDays: null,
    durationMinutes: 75,
    category: "Uñas",
    inventoryQty: null,
    capacityPoolId: null,
    consumesUnits: 1,
    status: "published",
    firstPublishedAt: "2026-01-01T00:00:00Z",
    visibility: "public",
    moderationState: "approved",
    isFeatured: false,
    sortOrder: 0,
    attributes: {},
    imageUrls: [],
    variants: [],
    addOns: [],
    ...partial,
  };
}

const PEDICURE = offering({ id: "3fa91c2b-1111-4222-8333-444455556666", title: "Pedicura gel", sortOrder: 0 });
const CUT = offering({ id: "9be01d44-2222-4333-8444-555566667777", title: "Corte de cabello", sortOrder: 1, category: "Cabello" });
const PACKAGE = offering({ id: "c7d2e8f0-3333-4444-8555-666677778888", title: "Paquete novia", kind: "package", sortOrder: 2, category: "Novias" });
const OFFERINGS = [PEDICURE, CUT, PACKAGE];

/** Every `<a data-service-page-link href>` in the markup as { href, text }. */
function serviceLinks(html: string): { href: string; text: string }[] {
  return [...html.matchAll(/<a\s[^>]*?href="([^"]+)"[^>]*?data-service-page-link=""[^>]*>([^<]*)<\/a>/g)].map((m) => ({
    href: m[1]!,
    text: m[2]!,
  }));
}

/** The link base the published site hands the block (render-max-site-document.tsx). */
const linkBase = (locale: string) => talentSiteLocalePath("/", locale, "es", ["es", "en"]).replace(/\/+$/, "");

test("TUL-1087: the Spanish home links every card to its service page at the host root", () => {
  assert.equal(linkBase("es"), "");
  const links = serviceLinks(render({ talentOfferings: OFFERINGS, talentServiceLinkBase: linkBase("es") }));
  assert.deepEqual(
    links.map((l) => l.href).sort(),
    OFFERINGS.map((o) => `/${serviceSlug(o)}`).sort(),
  );
});

test("TUL-1087: the English home links every card to the /en service page", () => {
  assert.equal(linkBase("en"), "/en");
  const links = serviceLinks(render({ talentOfferings: OFFERINGS, talentServiceLinkBase: linkBase("en") }));
  assert.deepEqual(
    links.map((l) => l.href).sort(),
    OFFERINGS.map((o) => `/en/${serviceSlug(o)}`).sort(),
  );
});

test("TUL-1087: each link carries its own card's title (no card points at another service)", () => {
  const links = serviceLinks(render({ talentOfferings: OFFERINGS, talentServiceLinkBase: "/en" }));
  assert.equal(links.length, OFFERINGS.length);
  for (const o of OFFERINGS) {
    const link = links.find((l) => l.text === o.title);
    assert.ok(link, `no link for "${o.title}"`);
    assert.equal(link.href, `/en/${serviceSlug(o)}`);
  }
});

test("TUL-1087: a service that has no page of its own gets no link", () => {
  const hidden = offering({ id: "aa000000-4444-4555-8666-777788889999", title: "Solo agencia", visibility: "agency_only" });
  const html = render({ talentOfferings: [...OFFERINGS, hidden], talentServiceLinkBase: "/en" });
  assert.equal(serviceLinks(html).some((l) => l.text === "Solo agencia"), false);
  assert.equal(serviceLinks(html).length, OFFERINGS.length);
});

test("TUL-1087: no link base (builder, hub, draft preview) means no service links", () => {
  assert.deepEqual(serviceLinks(render({ talentOfferings: OFFERINGS })), []);
  assert.deepEqual(serviceLinks(render({ talentOfferings: OFFERINGS, talentServiceLinkBase: null })), []);
});

test("TUL-1087: GUARD BITES: the link detector sees a real link and misses a plain title", () => {
  assert.equal(serviceLinks(render({ talentOfferings: [CUT], talentServiceLinkBase: "" })).length, 1);
  assert.equal(serviceLinks(render({ talentOfferings: [CUT] })).length, 0);
});
