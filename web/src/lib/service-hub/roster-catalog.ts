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

import type { RosterServiceItem } from "./roster-services";

export type RosterCatalogService = BusinessCatalogService & {
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
      id: i.offeringId,
      title: i.title.trim(),
      description: null,
      category: null,
      duration_minutes: null,
      price,
      amount_cents: i.priceCents,
      currency: i.currency,
      guest_sellable: true as const,
      source: "roster" as const,
      talent: i.talentName,
      booking: "request" as const,
    };
  });
}

/** The workspace's own services first, then roster entries; an id already listed is not repeated. */
export function mergeRosterIntoCatalog<T extends { id: string }>(own: readonly T[], roster: readonly RosterCatalogService[]): Array<T | RosterCatalogService> {
  const seen = new Set(own.map((s) => s.id));
  return [...own, ...roster.filter((r) => !seen.has(r.id))];
}
