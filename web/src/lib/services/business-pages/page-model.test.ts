import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  businessServiceBookHref,
  businessServicePagesAllowed,
  businessServicePageCopy,
  buildBusinessServiceJsonLd,
  businessServiceFacts,
  type BusinessServiceOffering,
} from "./page-model";

const O: BusinessServiceOffering = {
  id: "1a2b3c4d-0000-4000-8000-000000000000",
  kind: "service",
  title: "Masaje relajante",
  description: "Sesión de 60 minutos.",
  priceDisplay: "exact",
  amountCents: 120000,
  currency: "MXN",
  durationMinutes: 60,
  visibility: "public",
  imageUrls: ["https://cdn.example/m.jpg"],
  cancellationHours: 24,
  reserveMode: "deposit",
  depositPct: 50,
};

describe("businessServicePagesAllowed (PM: free = no own page; studio/agency/network = own page)", () => {
  it("flag off: never", () => {
    assert.equal(businessServicePagesAllowed({ flagOn: false, planTier: "agency" }), false);
  });
  it("flag on: paid workspace plans only", () => {
    for (const p of ["website", "studio", "agency", "network"]) assert.equal(businessServicePagesAllowed({ flagOn: true, planTier: p }), true, p);
    for (const p of ["free", null, "legacy"]) assert.equal(businessServicePagesAllowed({ flagOn: true, planTier: p }), false, String(p));
  });
});

describe("businessServiceFacts", () => {
  it("price, duration, policies in Spanish", () => {
    const f = businessServiceFacts(O, "es");
    assert.match(f.priceText ?? "", /1,200|1200/);
    assert.ok(f.durationText);
    assert.deepEqual(f.policies, ["Cancelación gratuita hasta 24 h antes", "Anticipo del 50% al reservar"]);
    assert.equal(f.ctaLabel, "Reservar este servicio");
  });
  it("D-10a: on_request has no price, only the note, and the quote CTA", () => {
    const f = businessServiceFacts({ ...O, visibility: "on_request" }, "en");
    assert.equal(f.priceText, null);
    assert.equal(f.priceNote, "Price on request");
    assert.equal(f.ctaLabel, "Request a quote");
    assert.doesNotMatch(JSON.stringify(f), /1,200|1200/);
  });
});

describe("buildBusinessServiceJsonLd", () => {
  const url = "https://spa.example/es/servicios/masaje-relajante-1a2b3c4d";
  it("Service with an Organization provider, offer, breadcrumb to the site home", () => {
    const ld = buildBusinessServiceJsonLd({ offering: O, canonicalUrl: url, businessName: "Spa Luna", locale: "es", faq: [] });
    const graph = ld["@graph"] as Array<Record<string, unknown>>;
    const service = graph.find((n) => n["@type"] === "Service")!;
    assert.equal(service.name, "Masaje relajante");
    assert.deepEqual(service.provider, { "@type": "Organization", "@id": "https://spa.example/#organization", name: "Spa Luna", url: "https://spa.example/" });
    assert.ok(service.offers);
    const crumbs = graph.find((n) => n["@type"] === "BreadcrumbList")!;
    const items = crumbs.itemListElement as Array<Record<string, unknown>>;
    assert.equal(items[0]!.item, "https://spa.example/es");
    assert.equal(items[1]!.item, url);
  });
  it("D-10a: on_request carries no price in JSON-LD", () => {
    const ld = buildBusinessServiceJsonLd({ offering: { ...O, visibility: "on_request" }, canonicalUrl: url, businessName: "Spa", locale: "es", faq: [] });
    assert.doesNotMatch(JSON.stringify(ld), /"price"/);
  });
  it("FAQPage only when the page shows an FAQ", () => {
    const ld = buildBusinessServiceJsonLd({ offering: O, canonicalUrl: url, businessName: "Spa", locale: "es", faq: [{ question: "¿Cuánto dura?", answer: "60 min." }] });
    assert.ok((ld["@graph"] as Array<Record<string, unknown>>).some((n) => n["@type"] === "FAQPage"));
  });
});

describe("copy", () => {
  it("ES and EN have the same keys and no em dashes", () => {
    const es = businessServicePageCopy("es");
    const en = businessServicePageCopy("en");
    assert.deepEqual(Object.keys(es).sort(), Object.keys(en).sort());
    for (const v of [...Object.values(es), ...Object.values(en)]) if (typeof v === "string") assert.equal(v.includes("—"), false);
  });
});

describe("businessServiceBookHref", () => {
  it("the workspace /book page with the service preselected (?service=, the param /book reads per #4078)", () => {
    assert.equal(businessServiceBookHref("/book", "1a2b3c4d-0000-4000-8000-000000000000"), "/book?service=1a2b3c4d-0000-4000-8000-000000000000");
    assert.equal(businessServiceBookHref("/es/book", "x y"), "/es/book?service=x%20y");
  });
  it("talent-site deep link (?book=...#book) is never used: business homes do not handle it", () => {
    assert.doesNotMatch(businessServiceBookHref("/book", "abc"), /[?&]book=|#book/);
  });
});
