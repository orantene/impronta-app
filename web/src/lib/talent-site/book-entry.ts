/**
 * Where `<site>#book` lands (TUL-246). PURE.
 *
 * A talent with one or more bookable services opens the booking sheet (the same
 * `tulala:offering-*` event a tap on the service card dispatches, built by the
 * same `buildOfferingRequestDetail`). With several, the preferred offering is
 * featured first, then lowest `sortOrder` (stable by id). With none, the plain
 * inquire entry (guest dock / form). `#talent-ask` and contact links always
 * open the guest chat.
 *
 * Live QA (jorg-beauty-qa / book-jorgelina): `#book` must open the sheet, never
 * the guest dock, even when the menu has many services. The dock is chat; Book
 * is the sheet.
 *
 * "Bookable" mirrors what the sheet itself accepts: a visible service whose CTA
 * is Book or Request to book, priced, and not a straight purchase (products and
 * untimed packages go through the purchase mount, which the sheet skips).
 */
import { catalogDetailIsPurchase } from "@/components/public-booking/catalog-booking-logic";
import { deriveOfferingCta } from "@/lib/talent/offering-cta-derivation";
import type { OfferingRequestDetail } from "@/lib/talent/offering-request-detail";
import type { TalentOffering } from "@/lib/talent/offerings-types";
import { buildOfferingRequestDetail } from "@/lib/talent-site/offering-request-detail-build";
import type { OpenIntent } from "@/lib/talent-site/open-intent-queue";

export type BookEntry =
  | { kind: "sheet"; offeringId: string; eventName: string; detail: OfferingRequestDetail }
  | { kind: "inquire" };

export type BookableEntry = {
  offering: TalentOffering;
  eventName: string;
  detail: OfferingRequestDetail;
};

/** Featured first, then sortOrder ascending, then id (stable). */
export function preferBookableOffering(
  bookable: readonly BookableEntry[],
): BookableEntry | undefined {
  if (bookable.length === 0) return undefined;
  const featured = bookable.filter((b) => b.offering.isFeatured === true);
  const pool = featured.length > 0 ? featured : bookable;
  return [...pool].sort((a, b) => {
    const bySort = (a.offering.sortOrder ?? 0) - (b.offering.sortOrder ?? 0);
    if (bySort !== 0) return bySort;
    return a.offering.id.localeCompare(b.offering.id);
  })[0];
}

export function resolveBookEntry(input: {
  offerings: readonly TalentOffering[];
  /** Talent selling_defaults, for offerings that inherit their booking mode. */
  defaults?: unknown;
  confirmsByHand?: boolean;
}): BookEntry {
  return bookEntryFrom(listBookableOfferings(input));
}

/** The services a visitor can open the booking sheet for, in menu order. */
export function listBookableOfferings(input: {
  offerings: readonly TalentOffering[];
  defaults?: unknown;
  confirmsByHand?: boolean;
}): BookableEntry[] {
  const bookable: BookableEntry[] = [];
  for (const offering of input.offerings) {
    const derived = deriveOfferingCta({
      offering,
      defaults: input.defaults ?? {},
      confirmsByHand: input.confirmsByHand,
    });
    if (derived.hidden) continue;
    if (derived.cta !== "book_now" && derived.cta !== "request_to_book") continue;
    if (offering.priceDisplay === "quote") continue;
    const detail = buildOfferingRequestDetail(offering, derived.instant);
    if (catalogDetailIsPurchase(detail)) continue;
    bookable.push({ offering, eventName: derived.eventName, detail });
  }
  return bookable;
}

export function bookEntryFrom(bookable: readonly BookableEntry[]): BookEntry {
  const preferred = preferBookableOffering(bookable);
  if (preferred) {
    return {
      kind: "sheet",
      offeringId: preferred.offering.id,
      eventName: preferred.eventName,
      detail: preferred.detail,
    };
  }
  return { kind: "inquire" };
}

/** What a followed link should open. `book` honours the entry; `ask` is always the chat. */
export function openIntentFor(target: "book" | "ask", entry: BookEntry | null | undefined): OpenIntent {
  if (target === "book" && entry?.kind === "sheet") {
    return { channel: "sheet", eventName: entry.eventName, detail: entry.detail };
  }
  return { channel: "chat" };
}

/** Which intent a location hash or link href asks for; null when it asks for nothing. */
export function intentForHref(href: string, entry: BookEntry | null | undefined): OpenIntent | null {
  const hash = href.includes("#") ? `#${href.split("#").pop() ?? ""}` : "";
  if (hash === "#book") return openIntentFor("book", entry);
  if (hash === "#talent-ask") return openIntentFor("ask", entry);
  return null;
}
