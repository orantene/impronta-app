/**
 * What a visitor sees of a workspace's service hub (TUL-1369 leftovers). Pure.
 *
 * Request-only: a hub entry is never bought here, the visitor asks. Only entries the owner
 * has not hidden, whose members are sellable (the database said so, see
 * `workspace_service_listing_is_sellable`), are shown. Names follow the entry's "who is
 * shown" setting. No member, listing or talent id reaches the public shape.
 */

export type PublicMember = {
  listingId: string;
  talentName: string;
  /** The member's offering, so an instant entry can pin it in the booking widget. */
  offeringId?: string | null;
  priceCents: number | null;
  currency: string;
  /** The database's own sellable check passed for this listing. */
  sellable: boolean;
};

export type PublicEntryInput = {
  id: string;
  name: string;
  category: string | null;
  photoUrl: string | null;
  hubPriceCents: number | null;
  currency: string | null;
  showWho: "name" | "portfolio" | "hidden";
  featured: boolean;
  hidden: boolean;
  ownOfferingId: string | null;
  /** TUL-1471: instant entries book through the booking widget; on-request entries stay enquiries. */
  bookingType?: "request" | "instant";
  members: PublicMember[];
};

export type PublicEntry = {
  id: string;
  name: string;
  category: string | null;
  photoUrl: string | null;
  priceCents: number | null;
  /** True when the price is the lowest of several, shown as "from". */
  from: boolean;
  currency: string | null;
  who: string[];
  cta: "request" | "book";
  /** The workspace's own offering the booking widget can pin for an instant entry (null = open the widget). */
  bookOfferingId: string | null;
};

export function shapePublicEntries(entries: readonly PublicEntryInput[]): PublicEntry[] {
  const out: Array<PublicEntry & { featured: boolean }> = [];
  for (const e of entries) {
    if (e.hidden) continue;
    const members = e.members.filter((m) => m.sellable);
    if (members.length === 0 && !e.ownOfferingId) continue;
    const prices = members.map((m) => m.priceCents).filter((p): p is number => typeof p === "number");
    let priceCents: number | null = null;
    let from = false;
    if (e.hubPriceCents != null) priceCents = e.hubPriceCents;
    else if (prices.length > 0) {
      priceCents = Math.min(...prices);
      from = new Set(prices).size > 1 || prices.length < members.length;
    }
    out.push({
      id: e.id,
      name: e.name,
      category: e.category,
      photoUrl: e.photoUrl,
      priceCents,
      from,
      currency: e.currency ?? members[0]?.currency ?? null,
      who: e.showWho === "name" ? [...new Set(members.map((m) => m.talentName).filter(Boolean))] : [],
      cta: e.bookingType === "instant" ? "book" : "request",
      bookOfferingId: e.bookingType === "instant" ? (e.ownOfferingId ?? members.find((m) => m.offeringId)?.offeringId ?? null) : null,
      featured: e.featured,
    });
  }
  out.sort((a, b) => Number(b.featured) - Number(a.featured) || a.name.localeCompare(b.name));
  return out.map((x) => ({ id: x.id, name: x.name, category: x.category, photoUrl: x.photoUrl, priceCents: x.priceCents, from: x.from, currency: x.currency, who: x.who, cta: x.cta, bookOfferingId: x.bookOfferingId }));
}
