import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { buildServiceQuickView, serviceQuickViewCopy, type QuickViewOffering } from "./quick-view-model";

const O: QuickViewOffering = {
  id: "1a2b3c4d-0000-4000-8000-000000000000",
  kind: "service",
  title: "Corte de pelo",
  description: "Corte con lavado y peinado.",
  priceDisplay: "exact",
  amountCents: 45000,
  currency: "MXN",
  durationMinutes: 45,
  visibility: "public",
  imageUrls: ["https://cdn.example/a.jpg", "https://cdn.example/a.jpg", "https://cdn.example/b.jpg"],
  category: "Pelo",
  cancellationHours: 24,
  bookingMode: "instant",
  reserveMode: "deposit",
  depositPct: 30,
};

describe("buildServiceQuickView", () => {
  it("carries the service facts: photos (deduped), price, duration, description, policies", () => {
    const qv = buildServiceQuickView(O, { locale: "es", homePath: "/", pageHref: null });
    assert.equal(qv.id, "servicio-1a2b3c4d");
    assert.equal(qv.offeringId, O.id);
    assert.deepEqual(qv.photos, ["https://cdn.example/a.jpg", "https://cdn.example/b.jpg"]);
    assert.match(qv.priceText ?? "", /450/);
    assert.equal(qv.durationText !== null, true);
    assert.equal(qv.description, "Corte con lavado y peinado.");
    assert.deepEqual(qv.policies, [
      "Cancelación gratuita hasta 24 h antes",
      "Anticipo del 30% al reservar",
    ]);
    assert.equal(qv.ctaLabel, "Reservar");
    assert.equal(qv.bookHref, "/?book=1a2b3c4d-0000-4000-8000-000000000000#book");
    assert.equal(qv.pageHref, null);
  });

  it("D-10a: an on_request service shows NO price, only the on-request note", () => {
    const qv = buildServiceQuickView({ ...O, visibility: "on_request" }, { locale: "es", homePath: "/", pageHref: null });
    assert.equal(qv.priceText, null);
    assert.equal(qv.priceNote, "Precio a consultar");
    const all = JSON.stringify(qv);
    assert.doesNotMatch(all, /450/);
  });

  it("English copy, page link when a page exists, quote CTA when there is no price", () => {
    const qv = buildServiceQuickView(
      { ...O, priceDisplay: "quote", amountCents: null, reserveMode: "full" },
      { locale: "en", homePath: "/en", pageHref: "/en/servicio-corte-de-pelo-1a2b3c4d" },
    );
    assert.equal(qv.pageHref, "/en/servicio-corte-de-pelo-1a2b3c4d");
    assert.equal(qv.ctaLabel, "Request a quote");
    assert.equal(qv.bookHref, "/en?book=1a2b3c4d-0000-4000-8000-000000000000#book");
    assert.deepEqual(qv.policies, ["Free cancellation up to 24 h before", "Paid in full when you book"]);
  });

  it("no CTA when the talent's switches hide it; FAQ from the talent's own items first", () => {
    const qv = buildServiceQuickView({ ...O, publicCtaHidden: true }, {
      locale: "es",
      homePath: "/",
      pageHref: null,
      talentFaq: [{ question: "¿Atiendes a domicilio?", answer: "Sí, en CDMX." }],
    });
    assert.equal(qv.bookHref, null);
    assert.deepEqual(qv.faq, [{ question: "¿Atiendes a domicilio?", answer: "Sí, en CDMX." }]);
  });

  it("derived FAQ never states a price for on_request", () => {
    const qv = buildServiceQuickView({ ...O, visibility: "on_request" }, { locale: "es", homePath: "/", pageHref: null });
    assert.equal(qv.faq.some((f) => /450/.test(f.answer)), false);
  });

  it("reviews: only shown when there is something real to show", () => {
    const none = buildServiceQuickView(O, { locale: "es", homePath: "/", pageHref: null, reviews: { average: 0, count: 0, reviews: [] } });
    assert.equal(none.reviews, null);
  });

  it("ES and EN copy have the same keys and no em dashes", () => {
    const es = serviceQuickViewCopy("es");
    const en = serviceQuickViewCopy("en");
    assert.deepEqual(Object.keys(es).sort(), Object.keys(en).sort());
    for (const v of [...Object.values(es), ...Object.values(en)]) {
      if (typeof v === "string") assert.equal(v.includes("—"), false, v);
    }
    assert.equal(es.fullPage, "Ver página completa");
    assert.equal(en.close, "Close");
  });
});
