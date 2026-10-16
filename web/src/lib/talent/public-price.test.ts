import test from "node:test";
import assert from "node:assert/strict";

import { catalogRowPriceText } from "@/lib/site-admin/builder-node/services-catalog-bar-price";
import { buildServicePageJsonLd, servicePageIsQuote, servicePagePriceText, servicePageCopy, type ServicePageOffering } from "@/lib/talent-site/service-page";
import { buildServiceOffers, offeringsToJsonLdServices } from "@/lib/seo/talent-json-ld";
import { publicPriceForJsonLd, resolvePublicPrice } from "./public-price";

const ladder = {
  id: "3fa91c2b-1111-4222-8333-444455556666",
  kind: "service",
  title: "Revision electrica",
  description: null,
  priceDisplay: "exact",
  priceType: "flat_package",
  amountCents: 55000,
  currency: "MXN",
  durationMinutes: 60,
  visibility: "public",
  attributes: {},
  variants: [
    { id: "a", label: "Casa", amountCents: 55000 },
    { id: "b", label: "Departamento", amountCents: 50000 },
    { id: "c", label: "Local", amountCents: 80000 },
  ],
} satisfies ServicePageOffering & { priceType: string; attributes: Record<string, unknown> };

const quote = { ...ladder, priceDisplay: "quote", amountCents: null, variants: [] };

test("TUL-791: service page price text equals the home card text, ES and EN", () => {
  for (const loc of ["es", "en"]) {
    for (const o of [ladder, quote, { ...ladder, variants: [] }]) {
      assert.equal(servicePagePriceText(o, loc), catalogRowPriceText(o as never, loc));
    }
  }
  assert.match(servicePagePriceText(ladder, "es"), /^Desde .*500/);
  assert.doesNotMatch(servicePagePriceText(ladder, "es"), /550/);
});

test("TUL-791: JSON-LD states the same cheapest figure as 'from'", () => {
  assert.deepEqual(publicPriceForJsonLd(ladder), { amountCents: 50000, priceDisplay: "from" });
  const ld = buildServicePageJsonLd({ offering: ladder, canonicalUrl: "https://x.test/servicio-a-3fa91c2b", talentName: "A", inLanguage: "es" });
  const spec = (ld.offers as { priceSpecification?: { minPrice?: string } }).priceSpecification;
  assert.equal(spec?.minPrice, "500.00");
  const [svc] = offeringsToJsonLdServices([ladder]);
  assert.equal(svc.amountCents, 50000);
  assert.equal(svc.priceDisplay, "from");
});

test("TUL-794: quote-only service is labelled, has a quote CTA and a valid Offer", () => {
  assert.equal(resolvePublicPrice(quote, "es").mode, "quote");
  assert.equal(servicePagePriceText(quote, "es"), "A cotizar");
  assert.equal(servicePagePriceText(quote, "en"), "Quote");
  assert.equal(servicePageIsQuote(quote), true);
  assert.equal(servicePageIsQuote(ladder), false);
  assert.equal(servicePageCopy("es").quote, "Pedir cotización");
  assert.equal(servicePageCopy("en").quote, "Request a quote");
  const ld = buildServicePageJsonLd({ offering: quote, canonicalUrl: "https://x.test/servicio-a-3fa91c2b", talentName: "A", inLanguage: "en" });
  const offers = ld.offers as Record<string, unknown>;
  assert.equal(offers.description, "Quote on request");
  assert.equal(offers.price, undefined);
  assert.equal(offers.priceSpecification, undefined);
});

test("TUL-794: priced services never carry the quote description", () => {
  const [o] = buildServiceOffers([{ name: "X", amountCents: 1000, currency: "MXN", priceDisplay: "exact" }], "p#1", "es") as Record<string, unknown>[];
  assert.equal(o.description, undefined);
  assert.equal(o.price, "10.00");
  const [q] = buildServiceOffers([{ name: "Q", amountCents: null, currency: "MXN", priceDisplay: "exact" }], "p#1", "es") as Record<string, unknown>[];
  assert.equal(q.description, "Cotización a pedido");
});
