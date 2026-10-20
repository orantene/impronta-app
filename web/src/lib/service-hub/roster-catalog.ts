/**
 * TUL-1372 (slice 2): roster services (accepted listing links) as public catalog
 * API entries. Pure. Only the AGENCY host's catalog merges them (the route
 * decides); the shared hub host never lists roster services.
 *
 * Request-only for now: the listing checkout reader does not exist yet, so an
 * entry says `booking: "request"` whatever the listing's booking type. The talent
 * name appears only when the entry's show-who says so; no profile id, phone or
 * email is ever part of an entry.
 */
import type { BusinessCatalogService } from "@/lib/offerings/business-catalog";
import { formatDashboardMoneyCents } from "@/lib/money/dashboard-money-format";

import type { CatalogRow } from "@/lib/messages-v5/items-picker";

import type { RosterServiceItem } from "./roster-services";

export type RosterCatalogService = Omit<BusinessCatalogService, "guest_sellable"> & {
  /** Request-only: a roster entry is never guest-sellable (no instant charge). */
  guest_sellable: false;
  source: "roster";
  /** the talent's name when this entry shows it, else null */
  talent: string | null;
  booking: "request";
};

const isEs = (locale: string) => locale.toLowerCase().startsWith("es");

export function rosterServicesToCatalog(items: readonly RosterServiceItem[], locale: string): RosterCatalogService[] {
  return items.map((i) => {
    const money = i.priceCents == null ? null : formatDashboardMoneyCents(i.priceCents, i.currency, locale);
    const price = money == null ? (isEs(locale) ? "A cotizar" : "Quote") : i.priceIsFrom ? `${isEs(locale) ? "Desde" : "From"} ${money}` : money;
    return {
      // Opaque, listing-derived: never the real offering id (a hidden-who entry must not leak it).
      id: `roster_${i.listingId}`,
      title: i.title.trim(),
      description: null,
      category: null,
      duration_minutes: null,
      price,
      amount_cents: i.priceCents,
      currency: i.currency,
      guest_sellable: false as const,
      source: "roster" as const,
      talent: i.talentName,
      booking: "request" as const,
    };
  });
}

/** The workspace's own services first, then roster entries (their ids are opaque and cannot collide). */
export function mergeRosterIntoCatalog<T extends { id: string }>(own: readonly T[], roster: readonly RosterCatalogService[]): Array<T | RosterCatalogService> {
  const seen = new Set(own.map((s) => s.id));
  return [...own, ...roster.filter((r) => !seen.has(r.id))];
}

/**
 * Roster entries as guest-dock catalog rows (the front-door chat). REQUEST-ONLY: no offering id
 * (so no add-to-inquiry line, no /book link) and no talent id (so no lineup cart); the talent name
 * is the owner chip only when the entry shows it.
 */
export function rosterItemsToCatalogRows(items: readonly RosterServiceItem[]): CatalogRow[] {
  return items.map((i) => ({
    id: `roster:${i.listingId}`,
    category: "service" as const,
    title: i.title.trim(),
    sub: null,
    amountCents: i.priceCents,
    currency: i.currency,
    availability: { kind: "free" as const },
    ownerName: i.talentName,
    requestOnly: true,
  }));
}
