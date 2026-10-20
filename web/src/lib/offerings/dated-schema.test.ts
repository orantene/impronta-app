import assert from "node:assert/strict";
import test from "node:test";

import { buildDatedJsonLd, datedSchemaKind, type DatedSchemaFacts } from "./dated-schema";

const facts: DatedSchemaFacts = {
  name: "Sunrise paddle",
  url: "https://example.com/s/sunrise-paddle",
  description: "Two hours on the water.",
  imageUrl: "https://example.com/a.jpg",
  currency: "USD",
  provider: "Blue Oar Co",
  place: { name: "Pier 4", address: "Pier 4, Harbor Rd" },
  languages: ["English", "Español"],
  minAge: 12,
  program: ["Briefing", "Paddle", "Breakfast"],
  dates: [
    { startsAt: "2026-11-10T11:00:00Z", endsAt: "2026-11-10T13:00:00Z", soldOut: false, salesCloseAt: "2026-11-10T10:00:00Z", fromPriceCents: 4500 },
    { startsAt: "2026-11-11T11:00:00Z", endsAt: "2026-11-11T13:00:00Z", soldOut: true, salesCloseAt: null, fromPriceCents: 4500 },
  ],
};

test("kind follows the trade's word for one date", () => {
  assert.equal(datedSchemaKind("Departure"), "TouristTrip");
  assert.equal(datedSchemaKind("Salida"), "TouristTrip");
  assert.equal(datedSchemaKind("Course"), "Course");
  assert.equal(datedSchemaKind("Curso"), "Course");
  assert.equal(datedSchemaKind("Class"), "Event");
  assert.equal(datedSchemaKind("Whatever"), "Event");
});

test("Event: one Event per date with offers, availability and the meeting point", () => {
  const docs = buildDatedJsonLd("Event", facts);
  assert.equal(docs.length, 2);
  const first = docs[0] as Record<string, unknown>;
  assert.equal(first["@type"], "Event");
  assert.equal(first.startDate, "2026-11-10T11:00:00Z");
  assert.deepEqual(first.location, { "@type": "Place", name: "Pier 4", address: "Pier 4, Harbor Rd" });
  const offer = first.offers as Record<string, unknown>;
  assert.equal(offer.price, "45.00");
  assert.equal(offer.priceCurrency, "USD");
  assert.equal(offer.availability, "https://schema.org/InStock");
  assert.equal(offer.validThrough, "2026-11-10T10:00:00Z");
  assert.equal((docs[1] as { offers: { availability: string } }).offers.availability, "https://schema.org/SoldOut");
  assert.deepEqual(first.inLanguage, ["English", "Español"]);
  assert.equal(first.typicalAgeRange, "12-");
});

test("Course: one Course with a CourseInstance per date", () => {
  const docs = buildDatedJsonLd("Course", facts);
  assert.equal(docs.length, 1);
  const c = docs[0] as { "@type": string; hasCourseInstance: Array<Record<string, unknown>> };
  assert.equal(c["@type"], "Course");
  assert.equal(c.hasCourseInstance.length, 2);
  assert.equal(c.hasCourseInstance[0]["@type"], "CourseInstance");
  assert.equal(c.hasCourseInstance[0].courseMode, "onsite");
});

test("TouristTrip: one trip with the program as an itinerary list", () => {
  const docs = buildDatedJsonLd("TouristTrip", facts);
  assert.equal(docs.length, 1);
  const t = docs[0] as { "@type": string; itinerary: { itemListElement: Array<{ name: string; position: number }> } };
  assert.equal(t["@type"], "TouristTrip");
  assert.deepEqual(t.itinerary.itemListElement.map((i) => i.name), ["Briefing", "Paddle", "Breakfast"]);
  assert.equal(t.itinerary.itemListElement[2].position, 3);
});

test("nothing is emitted without dates; no price means no offers, never a made-up zero", () => {
  assert.deepEqual(buildDatedJsonLd("Event", { ...facts, dates: [] }), []);
  const docs = buildDatedJsonLd("Event", { ...facts, dates: [{ ...facts.dates[0], fromPriceCents: null }] });
  assert.equal((docs[0] as Record<string, unknown>).offers, undefined);
});

test("a malformed date is skipped, never emitted", () => {
  const docs = buildDatedJsonLd("Event", { ...facts, dates: [{ ...facts.dates[0], startsAt: "nope" }, facts.dates[1]] });
  assert.equal(docs.length, 1);
});
