import test from "node:test";
import assert from "node:assert/strict";

import { buildEventJsonLd, eventTiersForJsonLd, type EventJsonLdInput } from "@/lib/seo/event-json-ld";
import { jsonLdScriptString } from "@/lib/cms/posts-public-model";

const BASE: EventJsonLdInput = {
  url: "https://venue.example/events/noche-de-salsa",
  name: "Noche de Salsa",
  description: "Live band and dancing.",
  imageUrl: "https://venue.example/cover.jpg",
  startsAt: "2026-11-01T02:00:00.000Z",
  endsAt: "2026-11-01T05:00:00.000Z",
  zone: "America/Cancun",
  venueName: "Casa Sol",
  venueAddress: "Calle 1, Tulum",
  organizerName: "Casa Sol",
  organizerUrl: "https://venue.example",
  publiclyListed: true,
  currency: "MXN",
  tiers: [{ label: "General", amountCents: 35000, onSale: true, soldOut: false }],
};

test("carries the required Event fields", () => {
  const ld = buildEventJsonLd(BASE)!;
  assert.equal(ld["@context"], "https://schema.org");
  assert.equal(ld["@type"], "Event");
  assert.equal(ld.name, "Noche de Salsa");
  assert.equal(ld.startDate, "2026-10-31T21:00:00-05:00");
  assert.equal(ld.endDate, "2026-11-01T00:00:00-05:00");
  assert.equal(ld.eventStatus, "https://schema.org/EventScheduled");
  assert.equal(ld.eventAttendanceMode, "https://schema.org/OfflineEventAttendanceMode");
  assert.deepEqual(ld.location, {
    "@type": "Place",
    name: "Casa Sol",
    address: "Calle 1, Tulum",
  });
  assert.deepEqual(ld.organizer, { "@type": "Organization", name: "Casa Sol", url: "https://venue.example" });
  assert.deepEqual(ld.image, ["https://venue.example/cover.jpg"]);
});

test("offer has price, currency, availability, url", () => {
  const ld = buildEventJsonLd(BASE)!;
  const offers = ld.offers as Array<Record<string, unknown>>;
  assert.equal(offers.length, 1);
  assert.equal(offers[0].price, 350);
  assert.equal(offers[0].priceCurrency, "MXN");
  assert.equal(offers[0].availability, "https://schema.org/InStock");
  assert.equal(offers[0].url, BASE.url);
});

test("a free tier is a price 0 offer", () => {
  const ld = buildEventJsonLd({ ...BASE, tiers: [{ label: "Free", amountCents: 0, onSale: true, soldOut: false }] })!;
  assert.equal((ld.offers as Array<Record<string, unknown>>)[0].price, 0);
});

test("a sold out tier is SoldOut", () => {
  const ld = buildEventJsonLd({ ...BASE, tiers: [{ label: "G", amountCents: 100, onSale: true, soldOut: true }] })!;
  assert.equal((ld.offers as Array<Record<string, unknown>>)[0].availability, "https://schema.org/SoldOut");
});

test("a tier opening later carries validFrom and PreOrder", () => {
  const ld = buildEventJsonLd({
    ...BASE,
    tiers: [{ label: "Early", amountCents: 100, onSale: false, soldOut: false, salesFrom: "2026-10-25T15:00:00.000Z" }],
  })!;
  const o = (ld.offers as Array<Record<string, unknown>>)[0];
  assert.equal(o.availability, "https://schema.org/PreOrder");
  assert.equal(o.validFrom, "2026-10-25T10:00:00-05:00");
});

test("offers are omitted when there are no tiers", () => {
  const ld = buildEventJsonLd({ ...BASE, tiers: [] })!;
  assert.equal("offers" in ld, false);
});

test("a hostile name cannot close the script tag", () => {
  const ld = buildEventJsonLd({ ...BASE, name: "</script><script>alert(1)</script>" })!;
  const out = jsonLdScriptString(ld);
  assert.equal(out.includes("</script>"), false);
  assert.equal(JSON.parse(out).name, "</script><script>alert(1)</script>");
});

test("no name or no start date means no markup", () => {
  assert.equal(buildEventJsonLd({ ...BASE, name: " " }), null);
  assert.equal(buildEventJsonLd({ ...BASE, startsAt: "not a date" }), null);
});

test("an online event uses VirtualLocation and online attendance", () => {
  const ld = buildEventJsonLd({ ...BASE, online: true, venueName: null, venueAddress: null })!;
  assert.equal(ld.eventAttendanceMode, "https://schema.org/OnlineEventAttendanceMode");
  assert.deepEqual(ld.location, { "@type": "VirtualLocation", url: BASE.url });
});

test("picker tiers: sold out only when sold out on every night that sells it", () => {
  const tiers = eventTiersForJsonLd({
    tiers: [
      { variantId: "a", label: "A", amountCents: 100, onSale: true, saleReason: null, hidden: false },
      { variantId: "b", label: "B", amountCents: 0, onSale: true, saleReason: null, hidden: false },
      { variantId: "h", label: "H", amountCents: 5, onSale: true, saleReason: null, hidden: true },
    ],
    nights: [
      { sellableVariantIds: ["a", "b"], availability: { a: "sold_out" } },
      { sellableVariantIds: ["a", "b"], availability: { a: "sold_out", b: "low" } },
    ],
  });
  assert.deepEqual(tiers.map((t) => [t.label, t.soldOut]), [["A", true], ["B", false]]);
});

test("unlisted, private or pending events get no markup", () => {
  assert.equal(buildEventJsonLd({ ...BASE, publiclyListed: false }), null);
});

test("venue address goes to location.address; address-only venue still has a location", () => {
  const ld = buildEventJsonLd({ ...BASE, venueName: null, venueAddress: "Calle 1, 77760 Tulum" })!;
  assert.deepEqual(ld.location, { "@type": "Place", name: "Calle 1, 77760 Tulum", address: "Calle 1, 77760 Tulum" });
});

test("location is omitted only when there is no venue at all", () => {
  const ld = buildEventJsonLd({ ...BASE, venueName: null, venueAddress: null })!;
  assert.equal("location" in ld, false);
});
