/**
 * TUL-1372 (slice 5): pure helpers behind the Services widget's roster grid.
 * REQUEST-ONLY: each entry's action is a link to the workspace contact form with
 * the service and talent in the message. Filters are client-side over the
 * entries already loaded; options come from those entries.
 */
import { rosterRequestHref } from "./roster-request";
import { rosterServicesToCatalog } from "./roster-catalog";
import type { RosterServiceItem } from "./roster-services";

export type RosterGridEntry = {
  id: string;
  title: string;
  who: string;
  price: string;
  href: string;
  /** TUL-1471b: an instant entry books in the widget ("book"); every other one asks ("request"). */
  cta: "book" | "request";
};

const isEs = (locale: string) => locale.toLowerCase().startsWith("es");

/** The talent's name, or the workspace label when the entry hides the talent. */
export function rosterGridEntries(items: readonly RosterServiceItem[], locale: string, contactHref: string, bookHref?: string): RosterGridEntry[] {
  const priced = rosterServicesToCatalog(items, locale);
  return items.map((i, idx) => {
    // TUL-1471b: an INSTANT entry carrying its bookable offering opens the booking widget on it;
    // without the /book path or the offering it stays an enquiry.
    const book = !!bookHref && i.bookingType === "instant" && !!i.offeringId;
    return {
      // Opaque per-render key: no listing id reaches the client component.
      id: `r${idx}`,
      title: i.title.trim(),
      who: i.talentName?.trim() || (isEs(locale) ? "Nuestro equipo" : "Our team"),
      price: priced[idx]!.price,
      href: book ? `${bookHref}?service=${encodeURIComponent(i.offeringId)}` : rosterRequestHref(contactHref, i, locale),
      cta: book ? ("book" as const) : ("request" as const),
    };
  });
}

const sorted = (values: Iterable<string>) => [...new Set(values)].sort((a, b) => a.localeCompare(b));

export function rosterGridFilters(entries: readonly RosterGridEntry[]): { services: string[]; who: string[] } {
  return { services: sorted(entries.map((e) => e.title)), who: sorted(entries.map((e) => e.who)) };
}

export function filterRosterEntries(entries: readonly RosterGridEntry[], f: { service?: string; who?: string }): RosterGridEntry[] {
  return entries.filter((e) => (!f.service || e.title === f.service) && (!f.who || e.who === f.who));
}
