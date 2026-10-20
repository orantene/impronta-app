import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { serviceCatalogPresentation, type ServicePresentationSource } from "./catalog-presentation";
import { PRESENTATION_MODES } from "./types";
import type { QuickViewOffering } from "./quick-view-model";

function offering(id8: string, title: string, extra: Partial<QuickViewOffering> = {}): QuickViewOffering {
  return {
    id: `${id8}-0000-4000-8000-000000000000`,
    kind: "service",
    title,
    description: null,
    priceDisplay: "exact",
    amountCents: 30000,
    currency: "MXN",
    durationMinutes: 60,
    visibility: "public",
    imageUrls: [],
    ...extra,
  };
}

const A = offering("aaaaaaaa", "Clase de salsa");
const B = offering("bbbbbbbb", "Clase privada");
const PAGE_HREFS = {
  [A.id]: "/en/servicio-clase-de-salsa-aaaaaaaa",
  [B.id]: "/en/servicio-clase-privada-bbbbbbbb",
};
const PAID: ServicePresentationSource = { tradeSlug: "dancer", allowedModes: PRESENTATION_MODES };
const FREE: ServicePresentationSource = { tradeSlug: "dancer", allowedModes: ["quick_view", "expand", "book_direct"] };

describe("serviceCatalogPresentation", () => {
  it("legacy (null) when the loader sent no presentation data (flag off) or the widget has no link base", () => {
    assert.equal(
      serviceCatalogPresentation({ nodeId: "n1", offerings: [A], source: undefined, linkBase: "/en", pageHrefs: PAGE_HREFS, locale: "en" }),
      null,
    );
    assert.equal(
      serviceCatalogPresentation({ nodeId: "n1", offerings: [A], source: PAID, linkBase: null, pageHrefs: PAGE_HREFS, locale: "en" }),
      null,
    );
  });

  it("dancer on a paid plan: own page (PM default), no quick views", () => {
    const out = serviceCatalogPresentation({ nodeId: "n1", offerings: [A, B], source: PAID, linkBase: "/en", pageHrefs: PAGE_HREFS, locale: "en" });
    assert.ok(out);
    assert.deepEqual(out.hrefs, PAGE_HREFS);
    assert.deepEqual(out.quickViews, []);
  });

  it("dancer on the free plan: no own page, every card links to its quick view on the list", () => {
    const out = serviceCatalogPresentation({ nodeId: "n1", offerings: [A, B], source: FREE, linkBase: "/en", pageHrefs: PAGE_HREFS, locale: "en" });
    assert.ok(out);
    assert.equal(out.hrefs[A.id], "#servicio-aaaaaaaa");
    assert.equal(out.hrefs[B.id], "#servicio-bbbbbbbb");
    assert.deepEqual(out.quickViews.map((q) => q.id), ["servicio-aaaaaaaa", "servicio-bbbbbbbb"]);
    assert.deepEqual(out.quickViews.map((q) => q.domId), ["servicio-aaaaaaaa--n1", "servicio-bbbbbbbb--n1"]);
    assert.equal(out.quickViews[0]!.pageHref, null);
  });

  it("chef / tutor default to the quick view, with 'see full page' when the plan has pages", () => {
    const out = serviceCatalogPresentation({
      nodeId: "n1",
      offerings: [A],
      source: { ...PAID, tradeSlug: "chef" },
      linkBase: "",
      pageHrefs: { [A.id]: "/servicio-clase-de-salsa-aaaaaaaa" },
      locale: "es",
    });
    assert.ok(out);
    assert.equal(out.hrefs[A.id], "#servicio-aaaaaaaa");
    assert.equal(out.quickViews[0]!.pageHref, "/servicio-clase-de-salsa-aaaaaaaa");
    assert.equal(out.quickViews[0]!.bookHref, `/?book=${A.id}#book`);
  });

  it("the widget 'Al tocar' setting overrides the trade default", () => {
    const out = serviceCatalogPresentation({
      nodeId: "n1",
      offerings: [A],
      source: PAID,
      linkBase: "/en",
      pageHrefs: PAGE_HREFS,
      locale: "en",
      tapAction: "quick_view",
    });
    assert.ok(out);
    assert.equal(out.targets[A.id]!.opens, "quick_view");
    const book = serviceCatalogPresentation({ nodeId: "n1", offerings: [A], source: PAID, linkBase: "/en", pageHrefs: PAGE_HREFS, locale: "en", tapAction: "book" });
    assert.equal(book!.targets[A.id]!.opens, "book");
    assert.equal(book!.hrefs[A.id], PAGE_HREFS[A.id]);
    const junk = serviceCatalogPresentation({ nodeId: "n1", offerings: [A], source: PAID, linkBase: "/en", pageHrefs: PAGE_HREFS, locale: "en", tapAction: "modal" });
    assert.equal(junk!.targets[A.id]!.opens, "page");
  });

  it("a per-service stored setting wins over the trade default", () => {
    const out = serviceCatalogPresentation({
      nodeId: "n1",
      offerings: [A, B],
      source: { ...PAID, settings: { [B.id]: "quick_view" } },
      linkBase: "/en",
      pageHrefs: PAGE_HREFS,
      locale: "en",
    });
    assert.equal(out!.targets[A.id]!.opens, "page");
    assert.equal(out!.targets[B.id]!.opens, "quick_view");
  });

  it("services that are not page-eligible (products) keep no link and get no quick view", () => {
    const P = offering("cccccccc", "Gift card", { kind: "product" });
    const out = serviceCatalogPresentation({ nodeId: "n1", offerings: [P], source: FREE, linkBase: "/en", pageHrefs: {}, locale: "en" });
    assert.deepEqual(out!.hrefs, {});
    assert.deepEqual(out!.quickViews, []);
  });

  it("D-10a: on_request quick views carry no price", () => {
    const R = offering("dddddddd", "Coreografía", { visibility: "on_request" });
    const out = serviceCatalogPresentation({ nodeId: "n1", offerings: [R], source: FREE, linkBase: "/en", pageHrefs: {}, locale: "en" });
    assert.equal(out!.quickViews[0]!.priceText, null);
    assert.equal(out!.quickViews[0]!.priceNote, "Price on request");
  });
});
