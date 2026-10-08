/**
 * Where `<site>#book` lands (TUL-246). PURE.
 *
 * A talent with exactly ONE bookable service opens that service's booking
 * sheet directly (the same `tulala:offering-*` event a tap on the service card
 * dispatches, built by the same `buildOfferingRequestDetail`). With several, the
 * service picker (the guest dock) opens as before; with none, the plain inquire
 * entry. `#talent-ask` and contact links always open the guest chat.
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
  | { kind: "picker" }
  | { kind: "inquire" };

export function resolveBookEntry(input: {
  offerings: readonly TalentOffering[];
  /** Talent selling_defaults, for offerings that inherit their booking mode. */
  defaults?: unknown;
  confirmsByHand?: boolean;
}): BookEntry {
  const bookable: Array<{ offering: TalentOffering; eventName: string; detail: OfferingRequestDetail }> = [];
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
  const only = bookable.length === 1 ? bookable[0] : undefined;
  if (only) {
    return { kind: "sheet", offeringId: only.offering.id, eventName: only.eventName, detail: only.detail };
  }
  if (bookable.length > 1) return { kind: "picker" };
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
