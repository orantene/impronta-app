/**
 * Event structured data: schema.org Event JSON-LD for the public event page.
 *
 * Pure. Built from the same facts the page renders (title, nights, tiers, venue),
 * so the markup cannot promise something a visitor cannot see. Serialise with
 * `jsonLdScriptString` (never plain JSON.stringify): a venue or event name is
 * operator-typed text and must not be able to close the script tag.
 *
 * Dates carry the VENUE's UTC offset (`2026-10-31T21:00:00-05:00`), not a bare
 * `Z`, because Google reads a local start time against the event's place.
 * Offers: one per visible tier, price 0 for a free tier, `SoldOut` when the
 * tier is sold out on every night that sells it, `PreOrder` + `validFrom`
 * when sales open later. No tiers, no `offers` key at all.
 */

type JsonValue =
  | string
  | number
  | boolean
  | null
  | { [k: string]: JsonValue | undefined }
  | JsonValue[];

export type EventJsonLdTier = {
  label: string;
  amountCents: number;
  onSale: boolean;
  soldOut: boolean;
  /** ISO instant sales open, when they open later. */
  salesFrom?: string | null;
};

export interface EventJsonLdInput {
  /** Absolute canonical URL of the event page. */
  url: string;
  name: string;
  description?: string | null;
  imageUrl?: string | null;
  /** ISO instant of the first upcoming night. */
  startsAt: string;
  endsAt?: string | null;
  /** IANA zone of the venue, used to render the offset. */
  zone?: string | null;
  venueName?: string | null;
  venueAddress?: string | null;
  online?: boolean;
  organizerName?: string | null;
  organizerUrl?: string | null;
  cancelled?: boolean;
  /**
   * The event is published AND its backing offering is guest-sellable
   * (published, approved, public). Unlisted / private / pending events get no
   * markup: structured data must never advertise what search should not find.
   */
  publiclyListed: boolean;
  currency: string;
  tiers: readonly EventJsonLdTier[];
}

/** `2026-11-01T02:00:00.000Z` + `America/Cancun` -> `2026-10-31T21:00:00-05:00`. */
export function isoInZone(iso: string, zone?: string | null): string | null {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  if (!zone) return d.toISOString();
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: zone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      timeZoneName: "longOffset",
    }).formatToParts(d);
    const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
    const raw = get("timeZoneName"); // "GMT-05:00" | "GMT"
    const offset = raw === "GMT" ? "+00:00" : raw.replace("GMT", "");
    if (!/^[+-]\d{2}:\d{2}$/.test(offset)) return d.toISOString();
    return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}:${get("second")}${offset}`;
  } catch {
    return d.toISOString();
  }
}

const SCHEMA = "https://schema.org/";

function offerFor(tier: EventJsonLdTier, input: EventJsonLdInput): Record<string, JsonValue> {
  // A tier whose window already closed is dropped upstream, so "not on sale"
  // here means "opens later".
  const availability = tier.soldOut ? "SoldOut" : tier.onSale ? "InStock" : "PreOrder";
  const offer: Record<string, JsonValue> = {
    "@type": "Offer",
    name: tier.label,
    price: Math.max(0, tier.amountCents) / 100,
    priceCurrency: input.currency.toUpperCase(),
    availability: `${SCHEMA}${availability}`,
    url: input.url,
  };
  if (tier.salesFrom) {
    const validFrom = isoInZone(tier.salesFrom, input.zone);
    if (validFrom) offer.validFrom = validFrom;
  }
  return offer;
}

/** Returns null (caller emits nothing) without a name, a URL or a parseable start. */
export function buildEventJsonLd(
  input: EventJsonLdInput,
): Record<string, JsonValue> | null {
  const name = input.name?.trim();
  const startDate = isoInZone(input.startsAt, input.zone);
  if (!input.publiclyListed || !name || !input.url || !startDate) return null;

  const obj: Record<string, JsonValue> = {
    "@context": "https://schema.org",
    "@type": "Event",
    name,
    url: input.url,
    startDate,
    eventStatus: `${SCHEMA}${input.cancelled ? "EventCancelled" : "EventScheduled"}`,
    eventAttendanceMode: `${SCHEMA}${input.online ? "OnlineEventAttendanceMode" : "OfflineEventAttendanceMode"}`,
  };
  const endDate = input.endsAt ? isoInZone(input.endsAt, input.zone) : null;
  if (endDate) obj.endDate = endDate;
  const description = input.description?.trim();
  if (description) obj.description = description;
  if (input.imageUrl) obj.image = [input.imageUrl];

  if (input.online) {
    obj.location = { "@type": "VirtualLocation", url: input.url };
  } else if (input.venueName?.trim() || input.venueAddress?.trim()) {
    const address = input.venueAddress?.trim();
    const place: Record<string, JsonValue> = {
      "@type": "Place",
      name: (input.venueName?.trim() || address) as string,
    };
    if (address) place.address = address;
    obj.location = place;
  }
  if (input.organizerName?.trim()) {
    const org: Record<string, JsonValue> = { "@type": "Organization", name: input.organizerName.trim() };
    if (input.organizerUrl) org.url = input.organizerUrl;
    obj.organizer = org;
  }
  if (input.tiers.length > 0) obj.offers = input.tiers.map((t) => offerFor(t, input));
  return obj;
}

/**
 * The picker's tiers as JSON-LD tiers. Hidden (by link) tiers are never
 * advertised. A tier is sold out only when it is `sold_out` on EVERY night
 * that sells it (and at least one does).
 */
export function eventTiersForJsonLd(picker: {
  tiers: ReadonlyArray<{
    variantId: string;
    label: string;
    amountCents: number;
    onSale: boolean;
    saleReason: string | null;
    hidden: boolean;
    salesFrom?: string | null;
  }>;
  nights: ReadonlyArray<{
    sellableVariantIds: readonly string[];
    availability?: Record<string, string>;
  }>;
}): EventJsonLdTier[] {
  return picker.tiers
    .filter((t) => !t.hidden && t.saleReason !== "ended")
    .map((t) => {
      const selling = picker.nights.filter((n) => n.sellableVariantIds.includes(t.variantId));
      const soldOut = selling.length > 0 && selling.every((n) => n.availability?.[t.variantId] === "sold_out");
      return {
        label: t.label,
        amountCents: t.amountCents,
        onSale: t.onSale,
        soldOut,
        salesFrom: t.salesFrom ?? null,
      };
    });
}
