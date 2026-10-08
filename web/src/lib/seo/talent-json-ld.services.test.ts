import test from "node:test";
import assert from "node:assert/strict";

import { buildTalentProfileJsonLd, offeringsToJsonLdServices } from "./talent-json-ld";

const base = { canonicalUrl: "https://morena.tulala.digital/", name: "Morena" };

function person(ld: ReturnType<typeof buildTalentProfileJsonLd>) {
  return (ld as { mainEntity: Record<string, unknown> }).mainEntity;
}

test("JSON-LD: no services -> no makesOffer, Person still has an @id", () => {
  const p = person(buildTalentProfileJsonLd(base));
  assert.equal(p.makesOffer, undefined);
  assert.equal(p["@id"], "https://morena.tulala.digital/#person");
});

test("JSON-LD: exact-price service becomes Offer -> Service with provider = Person", () => {
  const p = person(
    buildTalentProfileJsonLd({
      ...base,
      services: [
        { name: "Haircut", description: "Cut and style", amountCents: 4500, currency: "usd", priceDisplay: "exact", durationMinutes: 45 },
      ],
    }),
  );
  assert.deepEqual(p.makesOffer, [
    {
      "@type": "Offer",
      itemOffered: {
        "@type": "Service",
        name: "Haircut",
        description: "Cut and style",
        provider: { "@id": "https://morena.tulala.digital/#person" },
      },
      price: "45.00",
      priceCurrency: "USD",
      eligibleDuration: { "@type": "QuantitativeValue", value: 45, unitCode: "MIN" },
    },
  ]);
});

test("JSON-LD: 'from' uses a minPrice spec; 'quote' states no price at all", () => {
  const p = person(
    buildTalentProfileJsonLd({
      ...base,
      services: [
        { name: "Color", amountCents: 9000, currency: "MXN", priceDisplay: "from" },
        { name: "Custom shoot", amountCents: 12345, currency: "USD", priceDisplay: "quote" },
      ],
    }),
  ) as { makesOffer: Array<Record<string, unknown>> };
  const [from, quote] = p.makesOffer;
  assert.equal(from.price, undefined);
  assert.deepEqual(from.priceSpecification, { "@type": "PriceSpecification", minPrice: "90.00", priceCurrency: "MXN" });
  assert.equal(quote.price, undefined);
  assert.equal(quote.priceSpecification, undefined);
  assert.equal(quote.priceCurrency, undefined);
});

test("JSON-LD: nothing invented (no duration, no price, blank names dropped)", () => {
  const p = person(
    buildTalentProfileJsonLd({
      ...base,
      services: [{ name: "  " }, { name: "Consult", amountCents: null, currency: "USD", priceDisplay: "exact" }],
    }),
  ) as { makesOffer: Array<Record<string, unknown>> };
  assert.equal(p.makesOffer.length, 1);
  assert.deepEqual(p.makesOffer[0], {
    "@type": "Offer",
    itemOffered: { "@type": "Service", name: "Consult", provider: { "@id": "https://morena.tulala.digital/#person" } },
  });
});

test("offeringsToJsonLdServices: services/packages only, never products or agency-only", () => {
  const mk = (kind: string, visibility = "public") => ({
    kind, title: kind, description: null, priceDisplay: "exact", amountCents: 100, currency: "USD", durationMinutes: null, visibility,
  });
  const out = offeringsToJsonLdServices([mk("service"), mk("package"), mk("product"), mk("service", "agency_only")]);
  assert.deepEqual(out.map((s) => s.name), ["service", "package"]);
});

test("JSON-LD: service count is capped at 20", () => {
  const services = Array.from({ length: 30 }, (_, i) => ({ name: `S${i}` }));
  const p = person(buildTalentProfileJsonLd({ ...base, services })) as { makesOffer: unknown[] };
  assert.equal(p.makesOffer.length, 20);
});
