/**
 * TUL-1599: hub entries as roster-service items, so every surface that lists loose roster
 * services (Services widget, public catalog API, guest dock, front-door request) can show the
 * owner's grouped entries and drop the loose rows those entries contain. Pure.
 *
 * Request-only, same privacy as the public reader (`public-hub.ts`): the talent names are
 * whatever the entry already allows (empty when hidden), the ids are opaque (`entry_<id>`),
 * and no real offering or talent id is ever carried. No new money logic: the price is the
 * entry's own shaped price; "from" is kept.
 */
import type { PublicEntry } from "./public-hub";
import type { RosterServiceItem } from "./roster-services";

/** Prefix of the opaque listing id an entry-backed item carries (never collides with a uuid). */
export const HUB_ENTRY_ITEM_PREFIX = "entry_";

export function hubEntriesToRosterItems(entries: readonly PublicEntry[]): RosterServiceItem[] {
  return entries.map((e) => ({
    listingId: `${HUB_ENTRY_ITEM_PREFIX}${e.id}`,
    offeringId: "",
    title: e.name.trim(),
    talentProfileId: null,
    talentName: e.who.length > 0 ? e.who.join(", ") : null,
    // No currency means no honest label for the number: show a quote, never a guessed currency.
    priceCents: e.currency ? e.priceCents : null,
    priceIsFrom: !!e.currency && e.priceCents != null && e.from,
    currency: e.currency ?? "",
    bookingType: "request" as const,
    clientContact: "workspace" as const,
  }));
}

/** Loose roster rows minus the ones a shown entry already contains. */
export function dropCoveredRoster<T extends { listingId: string }>(items: readonly T[], covered: ReadonlySet<string>): T[] {
  return covered.size === 0 ? [...items] : items.filter((i) => !covered.has(i.listingId));
}

/** Entries first (the owner's grouping), then the loose rows that remain. */
export function mergeHubAndLoose(
  hub: { entries: readonly PublicEntry[]; coveredListingIds: ReadonlySet<string> },
  loose: readonly RosterServiceItem[],
): RosterServiceItem[] {
  return [...hubEntriesToRosterItems(hub.entries), ...dropCoveredRoster(loose, hub.coveredListingIds)];
}
