/**
 * dated-schema.ts — schema.org JSON-LD for an item sold as dated places with
 * seats (TUL-1344 slice 6). The type follows the trade's word for one date:
 * trips and departures are a TouristTrip, courses a Course with one
 * CourseInstance per date, everything else (classes, workshops, shows,
 * clinics) an Event per date. Pure: facts in, documents out.
 *
 * Honest by construction: no dates, no documents; no price, no offers (never a
 * made-up zero); a malformed date is skipped rather than emitted.
 */

import type { JsonLdValue } from "@/lib/site-admin/cms-seo";

export type DatedSchemaKind = "Event" | "Course" | "TouristTrip";

export function datedSchemaKind(dateWord: string): DatedSchemaKind {
  const w = dateWord.trim();
  if (/^(departure|salida|tour|trip|viaje|retreat|retiro|excursi[oó]n)$/i.test(w)) return "TouristTrip";
  if (/^(course|curso)$/i.test(w)) return "Course";
  return "Event";
}

export type DatedSchemaDate = {
  startsAt: string;
  endsAt: string | null;
  soldOut: boolean;
  salesCloseAt: string | null;
  fromPriceCents: number | null;
};

export type DatedSchemaFacts = {
  name: string;
  url: string;
  description?: string | null;
  imageUrl?: string | null;
  currency: string;
  provider?: string | null;
  place?: { name: string; address?: string | null } | null;
  languages?: string[];
  minAge?: number | null;
  program?: string[];
  dates: DatedSchemaDate[];
};

type Obj = { [key: string]: JsonLdValue };

const validIso = (s: string | null | undefined): s is string => !!s && Number.isFinite(Date.parse(s));

function offers(f: DatedSchemaFacts, d: DatedSchemaDate): Obj | null {
  if (d.fromPriceCents == null || !Number.isFinite(d.fromPriceCents) || d.fromPriceCents < 0) return null;
  const o: Obj = {
    "@type": "Offer",
    price: (d.fromPriceCents / 100).toFixed(2),
    priceCurrency: f.currency,
    url: f.url,
    availability: d.soldOut ? "https://schema.org/SoldOut" : "https://schema.org/InStock",
  };
  if (validIso(d.salesCloseAt)) o.validThrough = d.salesCloseAt;
  return o;
}

function common(f: DatedSchemaFacts): Obj {
  const o: Obj = { "@context": "https://schema.org", name: f.name, url: f.url };
  if (f.description) o.description = f.description;
  if (f.imageUrl) o.image = f.imageUrl;
  if (f.languages && f.languages.length > 0) o.inLanguage = f.languages;
  if (f.provider) o.provider = { "@type": "Organization", name: f.provider };
  return o;
}

export function buildDatedJsonLd(kind: DatedSchemaKind, f: DatedSchemaFacts): JsonLdValue[] {
  const dates = f.dates.filter((d) => validIso(d.startsAt));
  if (dates.length === 0) return [];

  if (kind === "Course") {
    const doc: Obj = { ...common(f), "@type": "Course" };
    doc.hasCourseInstance = dates.map((d) => {
      const inst: Obj = { "@type": "CourseInstance", courseMode: "onsite", startDate: d.startsAt };
      if (validIso(d.endsAt)) inst.endDate = d.endsAt;
      const off = offers(f, d);
      if (off) inst.offers = off;
      return inst;
    });
    return [doc];
  }

  if (kind === "TouristTrip") {
    const doc: Obj = { ...common(f), "@type": "TouristTrip" };
    if (f.program && f.program.length > 0) {
      doc.itinerary = {
        "@type": "ItemList",
        itemListElement: f.program.map((name, i) => ({ "@type": "ListItem", position: i + 1, name })),
      };
    }
    const offs = dates.map((d) => offers(f, d)).filter((o): o is Obj => o !== null);
    if (offs.length > 0) doc.offers = offs;
    return [doc];
  }

  return dates.map((d) => {
    const doc: Obj = {
      ...common(f),
      "@type": "Event",
      startDate: d.startsAt,
      eventStatus: "https://schema.org/EventScheduled",
      eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
    };
    if (validIso(d.endsAt)) doc.endDate = d.endsAt;
    if (f.place) {
      const place: Obj = { "@type": "Place", name: f.place.name };
      if (f.place.address) place.address = f.place.address;
      doc.location = place;
    }
    if (typeof f.minAge === "number" && f.minAge > 0) doc.typicalAgeRange = `${f.minAge}-`;
    const off = offers(f, d);
    if (off) doc.offers = off;
    return doc;
  });
}
