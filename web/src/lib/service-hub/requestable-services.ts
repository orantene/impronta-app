/**
 * TUL-1587 · a workspace with no roster services (a restaurant, a barber: its own catalog, no
 * talent listings) still lets a guest ask for its own services. Pure mapper: the workspace's own
 * guest-sellable catalog rows become the same request-only items the roster path uses, so ONE
 * request object (lines, party, day) exists on every kind of workspace.
 *
 * Opaque id: `svc_<offeringId>` in the listing slot, so the entry id is `roster_svc_<offeringId>`.
 * No price is read into the request; the display price is for the item type only.
 */
import type { BusinessCatalogService } from "@/lib/offerings/business-catalog";

import type { RosterServiceItem } from "./roster-services";

export const OWN_SERVICE_ID_PREFIX = "svc_";

export function ownServicesToRequestItems(rows: readonly BusinessCatalogService[]): RosterServiceItem[] {
  const out: RosterServiceItem[] = [];
  for (const r of rows) {
    const title = r.title.trim();
    if (!r.id || !title) continue;
    out.push({
      listingId: `${OWN_SERVICE_ID_PREFIX}${r.id}`,
      offeringId: r.id,
      title,
      talentProfileId: null,
      talentName: null,
      priceCents: r.amount_cents,
      priceIsFrom: false,
      currency: r.currency,
      bookingType: "request",
      clientContact: "workspace",
    });
  }
  return out;
}
